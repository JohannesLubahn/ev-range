// The stress cases of the spreadsheet (Battery Sizing tab), on top of the car model (Simple or Physics).
import { toDisplayCurrency } from './assumptions';
import type { BatteryView, CarModel, SegmentEnergy, SegmentSpec } from './model';
import type { CabinClimate } from './onboard/climate';
import type {
  BatteryLifeInputs,
  BatteryLifeResult,
  CapacityCheck,
  CostInputs,
  CostResult,
  DistanceCheckResult,
  LongTripInputs,
  LongTripResult,
  NoChargerInputs,
  SprintInputs,
  Step,
  TrafficJamInputs,
  TrafficJamResult,
} from './types';

const fx = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '∞');
const pct = (v: number) => `${fx(v, 0)} %`;

/** Combines segments into one load: total energy, time, mean power and RMS factor. */
function combine(segs: SegmentEnergy[]) {
  const energy = segs.reduce((s, x) => s + x.totalKwh, 0);
  const time = segs.reduce((s, x) => s + x.timeH, 0);
  const mean = time > 0 ? energy / time : 0;
  const meanSq = time > 0 ? segs.reduce((s, x) => s + (x.meanPowerKw * x.rmsFactor) ** 2 * x.timeH, 0) / time : 0;
  const rms = mean > 0 ? Math.max(1, Math.sqrt(meanSq) / mean) : 1;
  return { energy, time, mean, rms };
}

const kw = (w: number) => fx(Math.abs(w) / 1000, 2);

/** The cabin heat balance in words: where the heat comes from and what it costs. */
function climateText(cl: CabinClimate, engineHeat: boolean): string {
  if (cl.mode === 'none') return `no heating or cooling needed at ${fx(cl.setpointC, 0)} °C; blower ${fx(cl.blowerKw, 2)} kW`;
  if (cl.mode === 'heating') {
    const how = engineHeat
      ? 'engine waste heat'
      : cl.heatPumpShare > 0
        ? `heat pump${cl.heatPumpShare < 1 ? ` (${pct(cl.heatPumpShare * 100)}, rest resistive)` : ''}, ${fx(cl.cop, 2)} kW heat per kW`
        : 'resistive heater';
    return (
      `heating ${kw(cl.loadW)} kW to hold ${fx(cl.setpointC, 0)} °C: walls ${kw(cl.walls)} + fresh air ${kw(cl.freshAir)}` +
      `${cl.sun > 0 ? ` − sun ${kw(cl.sun)}` : ''} − people & devices ${kw(cl.inside)}; ${how}; + blower ${fx(cl.blowerKw, 2)} kW`
    );
  }
  return (
    `cooling ${kw(cl.loadW)} kW to hold ${fx(cl.setpointC, 0)} °C: walls ${kw(Math.max(0, cl.walls))} + fresh air ${kw(Math.max(0, cl.freshAir))}` +
    ` + sun ${kw(cl.sun)} + people & devices ${kw(cl.inside)} + drying the air ${kw(cl.moisture)}; ÷ COP ${fx(cl.cop, 2)} + blower ${fx(cl.blowerKw, 2)} kW`
  );
}

/** Battery heating / cooling over the trip (chemistry model). */
function thermalStep(bat: BatteryView, unit: string, scale = 1, scaleText = ''): Step[] {
  const th = bat.thermal;
  if (!th) return [];
  return [
    {
      label: 'Battery heating / cooling',
      formula: `${th.description}${th.heatingKwh + th.coolingKwh > 0 ? `; heating ${fx(th.heatingKwh, 2)} + cooling ${fx(th.coolingKwh, 2)} kWh` : ''}${scaleText}`,
      value: bat.thermalKwh * scale,
      unit,
    },
  ];
}

/** Explanation lines for one segment. */
function segmentSteps(m: CarModel, s: SegmentEnergy): Step[] {
  const u = m.d.energyUnit;
  const steps: Step[] = [];
  const name = s.spec.label;
  steps.push({
    label: `${name}: time`,
    formula: s.spec.timeH !== undefined ? 'given' : `${fx(s.distanceKm, 0)} km ÷ ${fx(s.avgSpeedKmh, 0)} km/h`,
    value: s.timeH,
    unit: 'h',
  });
  if (s.physics) {
    const p = s.physics;
    const f = p.forcesAtSpeed;
    steps.push({
      label: `${name}: speed profile`,
      formula: `${p.trace}; air ${fx(p.airDensity, 3)} kg/m³, mass ${fx(p.massKg, 0)} kg`,
      value: null,
      unit: '',
      kind: 'note',
    });
    steps.push({
      label: `Forces at ${fx(f.speedKmh, 0)} km/h`,
      formula: `air drag ${fx(f.aero, 0)} N + rolling ${fx(f.rolling, 0)} N (Crr ${fx(f.crr, 4)})${Math.abs(f.grade) > 0.5 ? ` + slope ${fx(f.grade, 0)} N` : ''}`,
      value: f.aero + f.rolling + f.grade,
      unit: 'N',
    });
    steps.push({
      label: 'Work at the wheels per km',
      formula: `air ${fx(p.aeroPerKm, 3)} + rolling ${fx(p.rollingPerKm, 3)}${Math.abs(p.gradePerKm) > 1e-4 ? ` + slope ${fx(p.gradePerKm, 3)}` : ''} + accelerating ${fx(p.accelPerKm, 3)} kWh/km`,
      value: p.aeroPerKm + p.rollingPerKm + p.gradePerKm + p.accelPerKm,
      unit: 'kWh/km',
    });
    const cal = m.calibration();
    steps.push({
      label: 'From the battery for driving',
      formula: m.d.isIce
        ? `÷ ${fx(cal.etaDrive, 2)} kWh per litre (calibrated)`
        : `÷ drivetrain ${fx(cal.etaDrive * 100, 1)} % (calibrated), − regeneration ${fx(p.regenPerKm, 3)} kWh/km`,
      value: p.drivePerKm,
      unit: `${u}/km`,
    });
  } else {
    const cons = s.distanceKm > 0 ? s.driveKwh / s.distanceKm : 0;
    steps.push({ label: `${name}: motors`, formula: `${fx(cons, 4)} ${u}/km${s.spec.highSpeed ? ' (high speed)' : ''}`, value: cons, unit: `${u}/km` });
  }
  steps.push({ label: `${name}: driving energy`, formula: `${fx(s.distanceKm, 1)} km × ${fx(s.distanceKm > 0 ? s.driveKwh / s.distanceKm : 0, 4)}`, value: s.driveKwh, unit: u });
  const o = s.onboard;
  const rate = m.physics && m.d.isIce ? 'l/h' : 'kW';
  if (m.physics && o.climate) {
    steps.push({
      label: `${name}: cabin climate`,
      formula: `${climateText(o.climate, m.d.isIce)}${m.d.isIce ? ' (in litres via the calibrated engine factor)' : ''}`,
      value: o.cabinFullKw,
      unit: rate,
    });
  }
  steps.push({
    label: `${name}: onboard systems`,
    formula: m.physics
      ? `(electronics ${fx(o.baseKw, 2)} + heating/AC ${fx(o.cabinFullKw, 2)} × ${pct(s.spec.usagePct)}) ${rate} × ${fx(s.timeH, 2)} h` +
        (s.startKwh > 0 ? ` + ${o.climate && o.climate.soakC > o.climate.setpointC ? 'cooling' : 'warming'} the parked cabin from ${fx(o.climate?.soakC ?? 0, 0)} °C ${fx(s.startKwh, 2)} ${u}` : '')
      : `${fx(m.d.car.onboardKw ?? 0, 1)} ${u === 'l' ? 'l/h' : 'kW'} × ${pct(s.spec.usagePct)} × ${fx(s.timeH, 2)} h`,
    value: s.onboardKwh,
    unit: u,
  });
  return steps;
}

function capacityCheck(m: CarModel, segs: SegmentEnergy[], startPct: number, endPct: number): CapacityCheck {
  const { energy: segEnergy, time, mean, rms } = combine(segs);
  const bat = m.battery(mean, rms, time);
  const energy = segEnergy + bat.thermalKwh;
  const deliv = bat.deliverable(startPct, endPct, mean, rms);
  const required = bat.requiredKwh(energy, startPct, endPct, mean, rms);
  const available = bat.availableKwh;
  const margin = available > 0 ? (available - required) / available : -Infinity;
  const u = m.d.energyUnit;
  const warnings: string[] = [];
  if (deliv.powerLimited) warnings.push('The battery cannot deliver the requested power at this temperature');
  if (deliv.cutoff) warnings.push('The battery voltage reaches its cut-off before the end of the window');
  const steps: Step[] = segs.flatMap((s) => segmentSteps(m, s));
  steps.push(...thermalStep(bat, u));
  const parts = [...segs.map((s) => s.totalKwh), ...(bat.thermal ? [bat.thermalKwh] : [])];
  steps.push({ label: 'Energy needed', formula: parts.map((v) => fx(v, 2)).join(' + '), value: energy, unit: u, kind: 'subtotal' });
  if (bat.model === 'chemistry') {
    steps.push({
      label: 'Battery',
      formula: `${m.d.chemistry} at ${fx(bat.temperatureC, 1)} °C on average, mean load ${fx(mean, 1)} kW`,
      value: null,
      unit: '',
      kind: 'note',
    });
    steps.push({
      label: `Deliverable ${pct(startPct)} → ${pct(endPct)}`,
      formula: `${fx(available, 1)} kWh long-term, after temperature and load losses (${fx(deliv.lossKwh, 2)} kWh)`,
      value: deliv.kwh,
      unit: u,
    });
    steps.push({ label: 'Battery needed (long-term capacity)', formula: `scaled until the window delivers ${fx(energy, 1)} ${u}`, value: required, unit: u, kind: 'result' });
  } else {
    steps.push({ label: 'Battery needed', formula: `${fx(energy, 2)} ÷ (${pct(startPct)} − ${pct(endPct)})`, value: required, unit: u, kind: 'result' });
  }
  steps.push({
    label: 'Battery available',
    formula: `${fx(m.d.batteryKwh ?? 0, 1)} ${u} × ${pct(m.d.longTermPct.value)} long-term capacity`,
    value: available,
    unit: u,
    kind: 'result',
  });
  return { requiredKwh: required, availableKwh: available, margin, pass: margin >= 0, energyKwh: energy, deliverableKwh: deliv.kwh, steps, warnings };
}

export function trafficJam(m: CarModel, i: TrafficJamInputs): TrafficJamResult {
  const outside: SegmentSpec = {
    label: 'Outside the jam',
    distanceKm: i.distBeforeKm + i.distAfterKm,
    avgSpeedKmh: i.speedOutsideKmh,
    profile: i.profileOutside,
    usagePct: i.usageOutsidePct,
    tripStart: true,
  };
  const jam: SegmentSpec = { label: 'In the jam', distanceKm: i.distJamKm, timeH: i.timeJamH, profile: 'jam', usagePct: i.usageJamPct };
  const segs = [m.segment(outside), m.segment(jam)];
  const check = capacityCheck(m, segs, i.startPct, i.endPct);
  // Longest jam: the jam's onboard energy grows with time; everything else stays.
  const jamSeg = segs[1];
  const fixed = check.energyKwh - jamSeg.onboardKwh;
  const room = check.deliverableKwh - fixed;
  const maxJamHours = jamSeg.onboard.totalKw > 0 ? Math.max(0, room / jamSeg.onboard.totalKw) : Infinity;
  return { ...check, maxJamHours };
}

function distanceCase(m: CarModel, spec: SegmentSpec, startPct: number, endPct: number): DistanceCheckResult {
  const seg = m.segment(spec);
  const check = capacityCheck(m, [seg], startPct, endPct);
  const maxDistanceKm = seg.perKm > 0 ? check.deliverableKwh / seg.perKm : Infinity;
  return { ...check, maxDistanceKm };
}

export function noCharger(m: CarModel, i: NoChargerInputs): DistanceCheckResult {
  return distanceCase(
    m,
    { label: 'Trip', distanceKm: i.distanceKm, avgSpeedKmh: i.speedKmh, profile: i.profile, climbM: i.climbM, usagePct: i.usagePct, tripStart: true },
    i.startPct,
    i.endPct,
  );
}

export function sprint(m: CarModel, i: SprintInputs): DistanceCheckResult {
  return distanceCase(
    m,
    {
      label: 'Sprint',
      distanceKm: i.distanceKm,
      avgSpeedKmh: i.speedKmh,
      profile: i.profile,
      climbM: i.climbM,
      usagePct: i.usagePct,
      highSpeed: true,
      tripStart: true,
    },
    i.startPct,
    i.endPct,
  );
}

/** Time (h) to charge from `fromPct` to `toPct`, fast inside the car's fast window, at taper speed outside. */
function chargingTime(m: CarModel, fromPct: number, toPct: number, onboardKw: number, exact: boolean): { hours: number; steps: Step[] } {
  const d = m.d;
  const rf = d.fastPctPerH ?? 0;
  const rs = d.slowPctPerH ?? 0;
  const ws = d.fastWindow?.from ?? fromPct;
  const we = d.fastWindow?.to ?? toPct;
  const steps: Step[] = [];
  if (exact) {
    // Spreadsheet formulas (Battery Sizing rows 41-43), including the kW-vs-%/h mix.
    const tLow = fromPct < ws ? (ws - fromPct) / (rs - onboardKw) : 0;
    const tFast = (Math.max(toPct, we) - Math.max(fromPct, ws)) / (rf - onboardKw);
    const tHigh = toPct < we ? (toPct - we) / (rs - onboardKw) : 0;
    return { hours: tLow + tFast + tHigh, steps };
  }
  const cap = d.longTermKwh && d.longTermKwh > 0 ? d.longTermKwh : 1;
  const drain = (onboardKw / cap) * 100; // %/h used by onboard systems while plugged in
  const parts = [
    { name: 'below the fast window', a: fromPct, b: Math.min(toPct, ws), rate: rs },
    { name: 'fast window', a: Math.max(fromPct, ws), b: Math.min(toPct, we), rate: rf },
    { name: 'above the fast window', a: Math.max(fromPct, we), b: toPct, rate: rs },
  ];
  let hours = 0;
  for (const p of parts) {
    const len = p.b - p.a;
    if (len <= 0) continue;
    const net = p.rate - drain;
    const h = net > 0 ? len / net : Infinity;
    hours += h;
    steps.push({ label: `Charging ${p.name}`, formula: `${fx(len, 0)} % ÷ (${fx(p.rate, 0)} − ${fx(drain, 1)}) %/h`, value: h, unit: 'h' });
  }
  return { hours, steps };
}

export function longTrip(m: CarModel, i: LongTripInputs, exact = !!m.ctx.settings.exactSpreadsheet): LongTripResult {
  const seg = m.segment({
    label: 'Driving',
    distanceKm: i.distanceKm,
    avgSpeedKmh: i.speedKmh,
    profile: i.profile,
    usagePct: i.usageDrivingPct,
    tripStart: true,
  });
  const bat = m.battery(seg.meanPowerKw, seg.rmsFactor, seg.timeH);
  const perCharge = bat.deliverable(i.chargeToPct, i.chargeFromPct, seg.meanPowerKw, seg.rmsFactor).kwh;
  const energy = seg.totalKwh + bat.thermalKwh;
  let chargings = perCharge > 0 ? energy / perCharge - 1 : Infinity;
  if (!exact) chargings = Math.max(0, chargings);
  const onboardCharging = m.onboard(i.usageChargingPct).totalKw;
  const ct = chargingTime(m, i.chargeFromPct, i.chargeToPct, onboardCharging, exact);
  const timeDrivingH = i.speedKmh > 0 ? i.distanceKm / i.speedKmh : 0;
  const timeChargingH = ct.hours * chargings;
  const tripTimeH = timeDrivingH + timeChargingH;
  const u = m.d.energyUnit;
  const warnings: string[] = [];
  if (!Number.isFinite(ct.hours)) warnings.push('Onboard consumption while charging exceeds the charging speed');
  if (m.d.fastPctPerH === null) warnings.push('Charging test data missing');
  const steps: Step[] = [
    ...segmentSteps(m, seg),
    ...thermalStep(bat, u),
    {
      label: 'Energy for the trip',
      formula: `${fx(seg.driveKwh, 1)} + ${fx(seg.onboardKwh, 1)}${bat.thermal ? ` + ${fx(bat.thermalKwh, 1)}` : ''}`,
      value: energy,
      unit: u,
      kind: 'subtotal',
    },
    {
      label: `Energy per charge (${pct(i.chargeFromPct)} → ${pct(i.chargeToPct)})`,
      formula: bat.model === 'chemistry' ? `deliverable at ${fx(bat.temperatureC, 1)} °C` : `${fx(bat.availableKwh, 1)} × (${pct(i.chargeToPct)} − ${pct(i.chargeFromPct)})`,
      value: perCharge,
      unit: u,
    },
    { label: 'Charging stops', formula: `${fx(energy, 1)} ÷ ${fx(perCharge, 1)} − 1 (start with a charged battery)`, value: chargings, unit: '', kind: 'subtotal' },
    { label: 'Onboard systems while charging', formula: '', value: onboardCharging, unit: 'kW' },
    ...ct.steps,
    { label: 'Time per charge', formula: '', value: ct.hours, unit: 'h' },
    { label: 'Driving time', formula: `${fx(i.distanceKm, 0)} km ÷ ${fx(i.speedKmh, 0)} km/h`, value: timeDrivingH, unit: 'h' },
    { label: 'Charging time', formula: `${fx(chargings, 2)} × ${fx(ct.hours, 2)} h`, value: timeChargingH, unit: 'h' },
    { label: 'Total trip time', formula: '', value: tripTimeH, unit: 'h', kind: 'result' },
  ];
  return {
    energyKwh: energy,
    capacityPerChargeKwh: perCharge,
    chargings,
    stops: Number.isFinite(chargings) ? Math.ceil(Math.max(0, chargings) - 1e-9) : Infinity,
    timePerChargeH: ct.hours,
    timeDrivingH,
    timeChargingH,
    tripTimeH,
    chargingSharePct: tripTimeH > 0 ? (timeChargingH / tripTimeH) * 100 : 0,
    steps,
    warnings,
  };
}

/**
 * Battery-life segment and the energy taken from the battery over the whole life (incl. losses). The daily drive
 * (km per year ÷ 365 at the average speed) is one trip: it starts with a parked cabin and battery each day.
 */
function lifeEnergy(m: CarModel, i: BatteryLifeInputs) {
  const totalKm = i.years * i.kmPerYear;
  const seg = m.segment({ label: 'Life', distanceKm: totalKm, avgSpeedKmh: i.speedKmh, profile: i.profile, usagePct: i.usagePct });
  const days = Math.max(0, i.years * 365);
  const dayH = days > 0 ? seg.timeH / days : 0;
  const bat = m.battery(seg.meanPowerKw, seg.rmsFactor, dayH);
  const losses = bat.lossFor(seg.totalKwh, seg.meanPowerKw, seg.rmsFactor);
  const startKwh = m.physics ? seg.onboard.startKwh * days : 0;
  const thermalKwh = bat.thermalKwh * days;
  return { totalKm, seg, bat, losses, days, dayH, startKwh, thermalKwh, energy: seg.totalKwh + losses + startKwh + thermalKwh };
}

export function batteryLife(m: CarModel, i: BatteryLifeInputs): BatteryLifeResult {
  const { totalKm, seg, bat, losses, days, dayH, startKwh, energy } = lifeEnergy(m, i);
  const available = bat.availableKwh;
  const cyclesRequired = available > 0 ? energy / available : Infinity;
  const rated = m.d.car.batteryCycles;
  const margin = rated ? (rated - cyclesRequired) / rated : null;
  const u = m.d.energyUnit;
  const steps: Step[] = [
    { label: 'Total distance', formula: `${fx(i.years, 0)} years × ${fx(i.kmPerYear, 0)} km`, value: totalKm, unit: 'km' },
    ...segmentSteps(m, seg),
    ...(startKwh > 0
      ? [{ label: 'Cabin at the start of each day', formula: `${fx(seg.onboard.startKwh, 2)} ${u} × ${fx(days, 0)} days`, value: startKwh, unit: u } as Step]
      : []),
    ...thermalStep(bat, u, days, ` per day (${fx(dayH, 2)} h of driving) × ${fx(days, 0)} days`),
    ...(losses > 0 ? [{ label: 'Battery losses', formula: `at ${fx(bat.temperatureC, 1)} °C`, value: losses, unit: u } as Step] : []),
    { label: 'Energy over the life', formula: '', value: energy, unit: u, kind: 'subtotal' },
    { label: 'Full cycles needed', formula: `${fx(energy, 0)} ÷ ${fx(available, 1)} ${u}`, value: cyclesRequired, unit: 'cycles', kind: 'result' },
    { label: 'Rated cycles', formula: '', value: rated, unit: 'cycles', kind: 'result' },
  ];
  return {
    totalKm,
    energyKwh: energy,
    cyclesRequired,
    cyclesAvailable: rated,
    margin,
    pass: margin === null ? null : margin >= 0,
    yearsUntilRated: rated && cyclesRequired > 0 ? (rated * i.years) / cyclesRequired : null,
    steps,
    warnings: rated ? [] : ['Rated battery cycles missing'],
  };
}

export function cost(m: CarModel, life: BatteryLifeInputs, ci: CostInputs, exact = !!m.ctx.settings.exactSpreadsheet): CostResult {
  const d = m.d;
  const a = m.ctx.a;
  const currency = a.displayCurrency;
  const warnings: string[] = [];
  const { totalKm, seg, energy } = lifeEnergy(m, life);
  // Energy paid for per km: rated figures (Simple model) are grid values already; physics values are at the
  // battery, so charging losses are added. Petrol: litres.
  let energyPerKm: number;
  let basisNote: string;
  if (exact) {
    energyPerKm = d.consumption.value ?? 0;
    basisNote = 'motors only (as in the spreadsheet)';
  } else if (!m.physics) {
    energyPerKm = seg.perKm;
    basisNote = 'motors + onboard systems (rated, from the grid)';
  } else {
    const eff = d.isIce ? 1 : a.chargingEfficiencyPct / 100;
    energyPerKm = totalKm > 0 ? energy / totalKm / eff : 0;
    basisNote = d.isIce ? 'litres per km' : `battery energy ÷ ${fx(eff * 100, 0)} % charging efficiency`;
  }
  const convert = (v: number) => (exact ? v : toDisplayCurrency(v, d.car.currency, a));
  let unitPrice = ci.energyPrice;
  if (d.car.energyPrice !== null) {
    const c = convert(d.car.energyPrice);
    if (c === null) warnings.push(`No exchange rate for ${d.car.currency}`);
    else unitPrice = c;
  }
  let maintenance = ci.maintenancePerYear;
  if (d.car.maintenancePerYear !== null) {
    const c = convert(d.car.maintenancePerYear);
    if (c !== null) maintenance = c;
  }
  const purchase = exact ? d.car.price : d.priceDisplay.value;
  if (purchase === null) warnings.push('Price missing');
  const energyCost = unitPrice * energyPerKm * totalKm;
  const maintenanceCost = maintenance * life.years;
  const tco = purchase === null ? null : purchase + energyCost + maintenanceCost;
  const u = d.energyUnit;
  const steps: Step[] = [
    { label: 'Purchase price', formula: d.car.currency !== currency && purchase !== null ? `${d.car.price} ${d.car.currency} converted` : '', value: purchase, unit: currency },
    { label: 'Energy per km', formula: basisNote, value: energyPerKm, unit: `${u}/km` },
    { label: 'Energy cost', formula: `${fx(unitPrice, 2)} ${currency}/${u} × ${fx(energyPerKm, 4)} × ${fx(totalKm, 0)} km`, value: energyCost, unit: currency },
    { label: 'Maintenance', formula: `${fx(maintenance, 0)} ${currency} × ${fx(life.years, 0)} years`, value: maintenanceCost, unit: currency },
    { label: 'Total cost of ownership', formula: '', value: tco, unit: currency, kind: 'result' },
    { label: 'Cost per km', formula: `÷ ${fx(totalKm, 0)} km`, value: tco === null ? null : tco / totalKm, unit: `${currency}/km`, kind: 'result' },
  ];
  return { currency, purchase, energyCost, maintenanceCost, tco, costPerKm: tco === null ? null : tco / totalKm, energyPerKm, steps, warnings };
}
