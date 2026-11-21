/** The files in content/, bundled into the app (editing one hot-reloads the dev server). */
import knownIssuesCsv from '../../content/known_issues.csv?raw';
import versionsCsv from '../../content/versions.csv?raw';
import legalMd from '../../content/legal.md?raw';
import { parseKnownIssues, parseNotes, parseVersions } from './parse';

const noteFiles = import.meta.glob<string>(['../../content/notes/*.md', '!../../content/notes/_*.md'], { query: '?raw', import: 'default', eager: true });

export const contentWarnings: string[] = [];
export const knownIssues = parseKnownIssues(knownIssuesCsv, contentWarnings);
export const versionWarnings: string[] = [];
export const versions = parseVersions(versionsCsv, versionWarnings);
export const notes = parseNotes(noteFiles);
export const legalNotice = legalMd;
