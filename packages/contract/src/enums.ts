export const INCIDENT_TYPES = [
  'stop_and_search',
  'vehicle_stop',
  'arrest',
  'use_of_force',
  'stop_and_question',
  'traffic_collision',
  'missing_person',
  'other',
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const POLICE_FORCES = [
  'avon-and-somerset',
  'bedfordshire',
  'cambridgeshire',
  'cheshire',
  'city-of-london',
  'cleveland',
  'cumbria',
  'derbyshire',
  'devon-and-cornwall',
  'dorset',
  'durham',
  'dyfed-powys',
  'essex',
  'gloucestershire',
  'greater-manchester',
  'gwent',
  'hampshire',
  'hertfordshire',
  'humberside',
  'kent',
  'lancashire',
  'leicestershire',
  'lincolnshire',
  'merseyside',
  'metropolitan',
  'norfolk',
  'north-wales',
  'north-yorkshire',
  'northamptonshire',
  'northumbria',
  'nottinghamshire',
  'south-wales',
  'south-yorkshire',
  'staffordshire',
  'suffolk',
  'surrey',
  'sussex',
  'thames-valley',
  'warwickshire',
  'west-mercia',
  'west-midlands',
  'west-yorkshire',
  'wiltshire',
  'police-scotland',
  'psni',
  'british-transport-police',
  'ministry-of-defence',
  'civil-nuclear',
  'other',
] as const;

export type PoliceForce = (typeof POLICE_FORCES)[number];

export const MODERATION_STATUSES = ['pending', 'approved', 'removed'] as const;

export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const REPORT_REASONS = [
  'illegal_content',
  'harassment',
  'misinformation',
  'privacy',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function formatForce(force: PoliceForce): string {
  return force
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
