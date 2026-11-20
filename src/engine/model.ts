// The energy model of one car: segment energies from the physics and the battery view (chemistry or ideal).
import type { Dataset } from '../data/types';
import type { DataFlag, DerivedCar } from './derive';
import { ageBattery, calendarCareFactor, careParams, cycleWearFactor, type AgeingInput, type AgeingResult } from './battery/ageing';
import { Pack } from './battery/pack';
import { coolingCop } from './onboard/climate';
import { baseLoadKw, onboardClass, onboardPower, type OnboardPower } from './onboard/loads';
import { packHeatCapacity, packThermal, type PackThermal } from './onboard/thermal';
import { airDensity, pressureAtAltitude } from './physics/air';
import { profileTrace } from './physics/profiles';
import { wheelForces, type Environment, type VehiclePhysics } from './physics/roadLoad';
import { simulate, type SimResult } from './physics/simulate';
import type { TraceDynamics } from './physics/style';
import { standardScenario } from './scenario';
import type { Assumptions, BatteryLifeInputs, Conditions, LifeDriving, ModelSettings, Profile } from './types';
import { clamp } from './util';

export interface SegmentSpec {
  label: string;
  distanceKm: number;
  /** Average speed including stops (km/h). Ignored if timeH is given. */
  avgSpeedKmh?: number;
  timeH?: number;
  profile: Profile;
  climbM?: number;
  /** Cabin temperature the heating / AC holds (°C), or null when it is off. */
  cabinC: number | null;
  /** First segment of a trip with the heating / AC on: the parked cabin is heated or cooled to the set temperature. */
  tripStart?: boolean;
}

export interface SegmentEnergy {
  spec: SegmentSpec;
  distanceKm: number;
  timeH: number;
  avgSpeedKmh: number;
  /** Driving energy from the battery terminals (kWh, or litres for ICE). */
  driveKwh: number;
  onboard: OnboardPower;
  /** Onboard energy: power × time, plus the cabin start energy on the first segment of a trip. */
  onboardKwh: number;
  /** Part of onboardKwh for heating / cooling the parked cabin at the start. */
  startKwh: number;
  totalKwh: number;
  /** Driving + onboard energy per km. */
  perKm: number;
  meanPowerKw: number;
  rmsFactor: number;
  physics: {
    trace: string;
    airDensity: number;
    massKg: number;
    /** Work per km at the wheels, kWh/km. */
    aeroPerKm: number;
    rollingPerKm: number;
    gradePerKm: number;
    accelPerKm: number;
    regenPerKm: number;
    /** Braking work at the wheels taken by the friction brakes (beyond the regeneration limits), kWh/km. */
    frictionPerKm: number;
    drivePerKm: number;
    /** Dynamics of the speed trace as driven (EU RDE metrics); null for a constant speed. */
    dynamics: TraceDynamics | null;
    /** Steady-speed force breakdown at the average moving speed (N). */
    forcesAtSpeed: { speedKmh: number; aero: number; rolling: number; grade: number; crr: number };
  };
}

export interface BatteryView {
  model: 'ideal' | 'chemistry';
  /** Capacity of the battery (kWh): aged by the km driven (Conditions), or nominal for a new battery. */
  availableKwh: number;
  temperatureC: number;
  temperatureNote: string;
  /** Pack temperature over the trip and the energy for heating / cooling it (chemistry model only). */
  thermal: PackThermal | null;
  /** Electric energy for battery heating + cooling over the trip (kWh). */
  thermalKwh: number;
  /** Energy deliverable at the terminals between two states of charge at a mean power. */
  deliverable(startPct: number, endPct: number, meanPowerKw: number, rmsFactor: number): { kwh: number; lossKwh: number; cutoff: boolean; powerLimited: boolean };
  /** Capacity (kWh) a battery of the same kind and age would need to deliver `energyKwh` in the window. */
  requiredKwh(energyKwh: number, startPct: number, endPct: number, meanPowerKw: number, rmsFactor: number): number;
  /** Losses for drawing `energyKwh` at the terminals (kWh). */
  lossFor(energyKwh: number, meanPowerKw: number, rmsFactor: number): number;
}

export interface Calibration {
  etaDrive: number;
  cycle: string;
  clamped: boolean;
  /** Test-cycle energies (kWh/km) used for the calibration. */
  ratedBatteryPerKm: number;
  note: string;
}

export interface ModelContext {
  ds: Dataset;
  a: Assumptions;
  conditions: Conditions;
  settings: ModelSettings;
  /** Battery-life inputs: years, km per year and the daily drive that set the battery ageing (default: the standard). */
  life?: BatteryLifeInputs;
  /**
   * The model with the Battery-life page's conditions: the battery's past (climate, driving style) for the wear after
   * the km driven. Without it, this model's own conditions are the past (the Battery-life model itself).
   */
  history?: CarModel;
  /** Shared by the car's models of the different tests: the calibration does not depend on the conditions. */
  shared?: { calibration?: Calibration };
}

/** Energy taken from the battery over the battery-life test's distance (new battery). */
export interface LifeEnergy {
  totalKm: number;
  seg: SegmentEnergy;
  bat: BatteryView;
  losses: number;
  days: number;
  dayH: number;
  startKwh: number;
  thermalKwh: number;
  energy: number;
}

export class CarModel {
  readonly d: DerivedCar;
  readonly ctx: ModelContext;
  private readonly shared: { calibration?: Calibration };
  private simCache = new Map<string, SimResult>();
  private onboardCache = new Map<string, OnboardPower>();
  /** The pack when new (state of health 100 %). */
  private pack: Pack | null = null;
  private agedPack: Pack | null = null;
  private ageingCache: AgeingResult | null | undefined = undefined;
  private lifePerKmCache = new Map<string, number>();
  /** Heat capacity of the battery pack (J/K). */
  readonly packHeatCapacityJPerK: number = 0;

  constructor(d: DerivedCar, ctx: ModelContext) {
    this.d = d;
    this.ctx = ctx;
    this.shared = ctx.shared ?? {};
    const chem = d.chemistry ? ctx.ds.chemistries[d.chemistry] : undefined;
    if (chem && d.batteryKwh) {
      this.pack = new Pack({
        chemistry: chem,
        capacityTemps: ctx.ds.capacityTemps,
        nominalKwh: d.batteryKwh,
        sohFrac: 1,
        packVoltageV: ctx.a.batteryPackVoltageV,
      });
      this.packHeatCapacityJPerK = packHeatCapacity(d.batteryKwh, chem);
    }
  }

  get usesChemistry(): boolean {
    return this.ctx.settings.battery === 'chemistry' && this.pack !== null && !this.d.isIce;
  }

  // ------------------------------------------------------------------------------------------ onboard
  /** Onboard power with the heating / AC holding `cabinC` (°C), or off (null). Cached per cabin temperature. */
  onboard(cabinC: number | null): OnboardPower {
    const key = cabinC === null ? 'off' : String(cabinC);
    const hit = this.onboardCache.get(key);
    if (hit) return hit;
    const { ds, a, conditions } = this.ctx;
    let p = onboardPower(ds, a, conditions, this.d.car.carClass, this.d.heatPump.value, cabinC, this.d.isIce);
    if (this.d.isIce) {
      // Petrol car: onboard power is produced by the engine; convert kW into litres/hour with the calibrated factor.
      // Heating uses the engine's waste heat (only the blower costs fuel).
      const f = 1 / this.calibration().etaDrive;
      p = { ...p, totalKw: p.totalKw * f, baseKw: p.baseKw * f, cabinKw: p.cabinKw * f, startKwh: p.startKwh * f };
    }
    this.onboardCache.set(key, p);
    return p;
  }

  // ------------------------------------------------------------------------------------------ physics
  vehicle(etaDrive: number, test = false): VehiclePhysics {
    const a = this.ctx.a;
    return {
      massKg: this.d.curbMassKg.value + (test ? a.testPayloadKg : this.ctx.conditions.payloadKg),
      cd: this.d.cd.value,
      frontalAreaM2: this.d.frontalAreaM2.value,
      crrRef: this.d.crrRef.value,
      tyrePressureRefBar: a.tyrePressureRefBar,
      rotatingMassFactor: a.rotatingMassFactor,
      etaDrive,
      etaRegen: this.d.isIce ? 0 : a.regenEfficiencyPct / 100,
      regenMaxDecelMs2: a.regenMaxDecelMs2,
      regenMinKmh: a.regenMinKmh,
    };
  }

  environment(grade: number, test = false): Environment {
    const c = this.ctx.conditions;
    const a = this.ctx.a;
    return test
      ? { airDensity: airDensity(a.testTemperatureC), tyrePressurePct: 100, grade: 0 }
      : { airDensity: airDensity(c.airTemperatureC, pressureAtAltitude(c.altitudeM)), tyrePressurePct: c.tyrePressurePct, grade };
  }

  /**
   * Effective drivetrain efficiency (battery → wheels), solved so that the car's own test cycle reproduces
   * its rated consumption exactly:  rated × η_charge × D = E_wheel⁺/η − E_regen + aux·t + losses, where E_regen is
   * the braking energy within the regeneration limits × η_regen. The test cycle is driven as is (no driving style).
   */
  calibration(): Calibration {
    if (this.shared.calibration) return this.shared.calibration;
    const { ds, a } = this.ctx;
    const d = this.d;
    const fallback = a.drivetrainEfficiencyDefaultPct / 100;
    const rated = d.consumption.value;
    if (rated === null) {
      return (this.shared.calibration = { etaDrive: fallback, cycle: '-', clamped: false, ratedBatteryPerKm: 0, note: 'no consumption: default efficiency' });
    }
    // The electronics run during the official tests too (climate control off).
    const auxKw = d.isIce ? 0 : baseLoadKw(onboardClass(ds, d.car.carClass));
    // Rated (test) consumption is measured from the grid. A value calculated as battery ÷ range is already
    // at the battery, so no charging losses are removed from it.
    const fromRange = d.consumption.provenance === 'calculated';
    const chargeEff = d.isIce || fromRange ? 1 : a.chargingEfficiencyPct / 100;
    const veh = this.vehicle(1, true);
    const env = this.environment(0, true);
    const cycles: { id: string; weight: number }[] =
      d.calibrationCycle === 'EPA'
        ? [
            { id: 'EPA_CITY', weight: 0.55 },
            { id: 'EPA_HIGHWAY', weight: 0.45 },
          ]
        : [{ id: d.calibrationCycle === 'CLTC' && ds.cycles.CLTC ? 'CLTC' : d.calibrationCycle, weight: 1 }];
    // EPA label values are lab results × 0.7 (derived 5-cycle adjustment); undo it for the lab cycles.
    const labFactor = d.calibrationCycle === 'EPA' ? 0.7 : 1;
    let posPerKm = 0;
    let rest = 0;
    let avgSpeedKmh = 0;
    for (const { id, weight } of cycles) {
      const cyc = ds.cycles[id];
      if (!cyc) continue;
      const sim = simulate(cyc.speedsKmh, veh, env, auxKw);
      posPerKm += (weight * sim.wheelPosKwh) / sim.distanceKm;
      rest += (weight * (auxKw * (sim.timeS / 3600) - sim.regenKwh)) / sim.distanceKm;
      avgSpeedKmh += weight * (sim.distanceKm / (sim.timeS / 3600));
    }
    if (posPerKm <= 0) {
      return (this.shared.calibration = { etaDrive: fallback, cycle: d.calibrationCycle, clamped: false, ratedBatteryPerKm: 0, note: 'cycle missing' });
    }
    let battPerKm = rated * labFactor * chargeEff;
    // Remove the pack's own losses at test conditions, so they are not counted twice. Test cycles are highly
    // dynamic; an RMS/mean power ratio of 1.3 is used for their losses.
    if (this.usesChemistry && this.pack) {
      const pMean = battPerKm * avgSpeedKmh;
      const r = this.pack.discharge(90, 10, pMean, 1.3, a.testTemperatureC);
      const lossFrac = r.terminalKwh > 0 ? r.lossKwh / r.terminalKwh : 0;
      battPerKm = battPerKm / (1 + lossFrac);
    }
    let eta = posPerKm / (battPerKm - rest);
    let clamped = false;
    if (!d.isIce && (!Number.isFinite(eta) || eta > 1 || eta < 0.5)) {
      clamped = true;
      eta = Number.isFinite(eta) && eta > 0 ? clamp(eta, 0.5, 1) : fallback;
    }
    const raw = posPerKm / (battPerKm - rest);
    const note = d.isIce
      ? `${eta.toFixed(2)} kWh at the wheels per litre (calibrated on ${d.calibrationCycle})`
      : clamped
        ? `${d.calibrationCycle} consumption would need a drivetrain efficiency of ${Number.isFinite(raw) && raw > 0 ? `${(raw * 100).toFixed(0)} %` : 'over 100 %'} with this weight, Cd and frontal area - limited to ${(eta * 100).toFixed(0)} %. Check the consumption (is it really ${d.calibrationCycle}?), weight and Cd`
        : `${(eta * 100).toFixed(1)} % battery → wheels, calibrated on ${d.calibrationCycle}`;
    return (this.shared.calibration = { etaDrive: eta, cycle: d.calibrationCycle, clamped, ratedBatteryPerKm: battPerKm, note });
  }

  /** Data-check messages that come from the physics calibration. */
  calibrationFlags(): DataFlag[] {
    if (this.d.consumption.value === null) return [];
    const cal = this.calibration();
    return cal.clamped ? [{ carId: this.d.car.id, severity: 'warning', field: 'consumption_kwh_per_km', message: cal.note }] : [];
  }

  /** Driving style of the Conditions as a factor on the trace dynamics (1 = the WLTP's own). */
  get styleFactor(): number {
    return (this.ctx.conditions.drivingStylePct ?? 100) / 100;
  }

  private simulateProfile(profile: Profile, avgKmh: number, grade: number): { sim: SimResult; trace: string; movingKmh: number; dynamics: TraceDynamics | null } {
    const tr = profileTrace(this.ctx.ds, profile, avgKmh, this.styleFactor, this.ctx.a.drivingStyleWindowS);
    const key = `${profile}|${avgKmh}|${grade}`;
    let sim = this.simCache.get(key);
    if (!sim) {
      sim = simulate(tr.speedsKmh, this.vehicle(this.calibration().etaDrive), this.environment(grade));
      this.simCache.set(key, sim);
    }
    return { sim, trace: tr.description, movingKmh: tr.movingAvgKmh, dynamics: tr.dynamics };
  }

  // ------------------------------------------------------------------------------------------ segments
  segment(spec: SegmentSpec): SegmentEnergy {
    const distanceKm = spec.distanceKm;
    const timeH = spec.timeH ?? (spec.avgSpeedKmh ? distanceKm / spec.avgSpeedKmh : 0);
    const avgSpeedKmh = timeH > 0 ? distanceKm / timeH : 0;
    const onboard = this.onboard(spec.cabinC);
    const startKwh = spec.tripStart ? onboard.startKwh : 0;
    const onboardKwh = onboard.totalKw * timeH + startKwh;
    const grade = distanceKm > 0 ? (spec.climbM ?? 0) / (distanceKm * 1000) : 0;
    const { sim, trace, movingKmh, dynamics } = this.simulateProfile(spec.profile, avgSpeedKmh, grade);
    const perKmDrive = sim.distanceKm > 0 ? sim.batteryKwh / sim.distanceKm : 0;
    const driveKwh = perKmDrive * distanceKm;
    const totalKwh = driveKwh + onboardKwh;
    // RMS of the battery power over the trace incl. onboard load, relative to the mean.
    const traceMeanKw = sim.timeS > 0 ? (sim.batteryKwh * 3600) / sim.timeS : 0;
    const meanSq = sim.meanSquareKw2 + 2 * traceMeanKw * onboard.totalKw + onboard.totalKw ** 2;
    const meanKw = traceMeanKw + onboard.totalKw;
    const rmsFactor = meanKw > 0 ? Math.max(1, Math.sqrt(Math.max(meanSq, 0)) / meanKw) : 1;
    const env = this.environment(grade);
    const veh = this.vehicle(this.calibration().etaDrive);
    const f = wheelForces(movingKmh / 3.6, 0, veh, env);
    const per = (x: number) => (sim.distanceKm > 0 ? x / sim.distanceKm : 0);
    return {
      spec, distanceKm, timeH, avgSpeedKmh, driveKwh, onboard, onboardKwh, startKwh, totalKwh,
      perKm: distanceKm > 0 ? totalKwh / distanceKm : 0,
      meanPowerKw: timeH > 0 ? totalKwh / timeH : 0,
      rmsFactor,
      physics: {
        trace,
        airDensity: env.airDensity,
        massKg: veh.massKg,
        aeroPerKm: per(sim.aeroKwh),
        rollingPerKm: per(sim.rollingKwh),
        gradePerKm: per(sim.gradeKwh),
        accelPerKm: per(sim.accelKwh),
        regenPerKm: per(sim.regenKwh),
        frictionPerKm: per(sim.frictionKwh),
        drivePerKm: perKmDrive,
        dynamics,
        forcesAtSpeed: { speedKmh: movingKmh, aero: f.aero, rolling: f.rolling, grade: f.grade, crr: f.crr },
      },
    };
  }

  // ------------------------------------------------------------------------------------------ battery ageing
  /** Battery-life inputs that set the ageing (the scenario's, or the spreadsheet defaults). */
  get life(): BatteryLifeInputs {
    return this.ctx.life ?? standardScenario(this.ctx.ds, this.ctx.a).batteryLife;
  }

  /**
   * Energy taken from the battery over `i.years × i.kmPerYear` with a new battery (incl. losses). The daily drive
   * (km per year ÷ 365 at the average speed) is one trip: it starts with a parked cabin and battery each day.
   */
  lifeEnergy(i: LifeDriving): LifeEnergy {
    const totalKm = i.years * i.kmPerYear;
    const seg = this.segment({ label: 'Life', distanceKm: totalKm, avgSpeedKmh: i.speedKmh, profile: i.profile, cabinC: i.cabinC });
    const days = Math.max(0, i.years * 365);
    const dayH = days > 0 ? seg.timeH / days : 0;
    const bat = this.battery(seg.meanPowerKw, seg.rmsFactor, dayH, true);
    const losses = bat.lossFor(seg.totalKwh, seg.meanPowerKw, seg.rmsFactor);
    const startKwh = seg.onboard.startKwh * days;
    const thermalKwh = bat.thermalKwh * days;
    return { totalKm, seg, bat, losses, days, dayH, startKwh, thermalKwh, energy: seg.totalKwh + losses + startKwh + thermalKwh };
  }

  /**
   * Battery ageing after `km` (default: the Conditions' km driven) with the battery-life driving: equivalent full
   * cycles, cycle and calendar fade, capacity left. Null for petrol cars and cars without battery data.
   */
  ageing(km?: number, lifeInputs?: BatteryLifeInputs): AgeingResult | null {
    const own = km === undefined && lifeInputs === undefined;
    if (own && this.ageingCache !== undefined) return this.ageingCache;
    const input = this.ageingInput(km ?? this.ctx.conditions.batteryKm ?? 0, lifeInputs ?? this.life);
    const r = input ? ageBattery(input) : null;
    if (own) this.ageingCache = r;
    return r;
  }

  /** The car's fast-charging rate in capacities per hour, from its charging test (null if unknown). */
  fastChargeCRate(): number | null {
    return this.d.fastPctPerH !== null ? this.d.fastPctPerH / 100 : null;
  }

  /**
   * Inputs of the ageing model after `km` with the battery-life driving and care habits. Null for petrol cars and
   * cars without battery data.
   */
  ageingInput(km: number, life: BatteryLifeInputs): AgeingInput | null {
    const d = this.d;
    const chem = d.chemistry ? this.ctx.ds.chemistries[d.chemistry] : undefined;
    if (d.isIce || !chem || !d.batteryKwh) return null;
    // The battery's past: the Battery-life page's conditions (climate, driving style), not this test's.
    const h = this.ctx.history ?? this;
    // Energy per km of the battery-life driving (the same for any number of years).
    const { years: _y, dcSharePct, highSocTimePct, ...driving } = life;
    const key = JSON.stringify(driving);
    let perKm = h.lifePerKmCache.get(key);
    if (perKm === undefined) {
      const perYear = h.lifeEnergy({ ...life, years: 1 });
      perKm = perYear.totalKm > 0 ? perYear.energy / perYear.totalKm : 0;
      h.lifePerKmCache.set(key, perKm);
    }
    const p = careParams(this.ctx.a);
    return {
      chem,
      nominalKwh: d.batteryKwh,
      ratedCycles: d.car.batteryCycles,
      eolPct: d.eolPct.value,
      kwhPerKm: perKm,
      km,
      kmPerYear: life.kmPerYear,
      temperatureC: h.ctx.conditions.airTemperatureC,
      cycleWearFactor: cycleWearFactor(p, dcSharePct ?? p.typical.dcSharePct, this.fastChargeCRate()),
      calendarFactor: calendarCareFactor(chem, p, highSocTimePct ?? p.typical.highSocTimePct),
    };
  }

  /** Battery capacity after the km driven (kWh); nominal for petrol cars (tank) and cars without ageing data. */
  capacityKwh(): number {
    return this.ageing()?.capacityKwh ?? this.d.batteryKwh ?? 0;
  }

  private agedPackOf(pack: Pack): Pack {
    if (!this.agedPack) this.agedPack = pack.withSoh((this.ageing()?.sohPct ?? 100) / 100);
    return this.agedPack;
  }

  // ------------------------------------------------------------------------------------------ battery
  /**
   * Battery view for a trip with the given mean power and duration. The pack temperature follows from its heat
   * capacity, its own losses, the air temperature and the thermal management (onboard/thermal.ts).
   */
  battery(meanPowerKw: number, rmsFactor = 1, durationH = 1, fresh = false): BatteryView {
    const d = this.d;
    const available = fresh ? (d.batteryKwh ?? 0) : this.capacityKwh();
    const c = this.ctx.conditions;
    if (!this.usesChemistry || !this.pack) {
      return {
        model: 'ideal',
        availableKwh: available,
        temperatureC: c.airTemperatureC,
        temperatureNote: d.isIce ? 'fuel tank' : 'ideal battery (no temperature or load effects)',
        thermal: null,
        thermalKwh: 0,
        deliverable: (s, e) => ({ kwh: (available * (s - e)) / 100, lossKwh: 0, cutoff: false, powerLimited: false }),
        requiredKwh: (energy, s, e) => (s - e > 0 ? energy / ((s - e) / 100) : Infinity),
        lossFor: () => 0,
      };
    }
    const pack = fresh ? this.pack : this.agedPackOf(this.pack);
    const a = this.ctx.a;
    const cop = coolingCop(c.airTemperatureC, a);
    const thermalWith = (lossKw: number) =>
      packThermal({
        airC: c.airTemperatureC,
        durationH,
        lossKw,
        heatCapacityJPerK: this.packHeatCapacityJPerK,
        mode: c.thermalMode,
        preconditionedC: c.preconditionedC,
        coolingCop: cop,
        a,
      });
    // Two passes: temperature without losses, then with the losses at that temperature.
    let th = thermalWith(0);
    const r0 = pack.discharge(90, 10, meanPowerKw, rmsFactor, th.meanC);
    const lossKw = r0.terminalKwh > 0 ? (meanPowerKw * r0.lossKwh) / r0.terminalKwh : 0;
    th = thermalWith(lossKw);
    const t = th.meanC;
    const deliverable = (s: number, e: number, p: number, rho: number) => {
      const r = pack.discharge(s, e, p, rho, t);
      return { kwh: r.terminalKwh, lossKwh: r.lossKwh, cutoff: r.cutoff, powerLimited: r.powerLimited };
    };
    return {
      model: 'chemistry',
      availableKwh: available,
      temperatureC: t,
      temperatureNote: th.description,
      thermal: th,
      thermalKwh: th.heatingKwh + th.coolingKwh,
      deliverable,
      requiredKwh: (energy, s, e, p, rho) => {
        // Scale the pack until the window delivers the energy (the C-rate changes with the size).
        let nominal = pack.opts.nominalKwh;
        for (let i = 0; i < 6; i++) {
          const got = pack.withNominal(nominal).discharge(s, e, p, rho, t).terminalKwh;
          if (got <= 0) return Infinity;
          const next = nominal * (energy / got);
          if (Math.abs(next - nominal) < 1e-6) break;
          nominal = next;
        }
        return nominal * pack.opts.sohFrac;
      },
      lossFor: (energy, p, rho) => {
        const r = pack.discharge(100, 0, p, rho, t);
        return r.terminalKwh > 0 ? (energy * r.lossKwh) / r.terminalKwh : 0;
      },
    };
  }
}
