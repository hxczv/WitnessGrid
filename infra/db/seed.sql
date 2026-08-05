-- WitnessGrid development seed data.
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING everywhere, so `pnpm seed` is safe to re-run.
-- All incidents are moderation_status='approved', point at dev users, use fixed UUIDs,
-- and carry one media row each whose sha256 is a 64-hex placeholder for a dev object.

-- 2 development users (local-only addresses, no real email).
INSERT INTO users (id, username, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'dev_witness_1', 'dev1@witnessgrid.local'),
  ('00000000-0000-4000-8000-000000000002', 'dev_witness_2', 'dev2@witnessgrid.local')
ON CONFLICT (id) DO NOTHING;

-- 8 incidents across UK forces, types and recent timestamps (late July / early Aug 2026, UTC).
-- location stored as geography(Point,4326) via ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography.
INSERT INTO incidents
  (id, user_id, client_id, type, police_force, location, location_accuracy_m, "timestamp", description, officer_count, created_at, view_count, moderation_status)
VALUES
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-100000000001',
   'stop_and_search', 'metropolitan', ST_SetSRID(ST_MakePoint(-0.1278, 51.5074), 4326)::geography, 10,
   '2026-07-27T08:15:00Z',
   'Officers stopped and searched a person outside the station entrance at King''s Cross during the morning commute. Section 60-style stop on the concourse; the person was released without charge after about twenty minutes. Recorded from the north footbridge with the full exchange visible.',
   2, '2026-07-27T08:16:00Z', 142, 'approved'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-100000000002',
   'vehicle_stop', 'west-midlands', ST_SetSRID(ST_MakePoint(-1.8904, 52.4862), 4326)::geography, 25,
   '2026-07-28T21:40:00Z',
   'Two officers in a marked car pulled over a silver hatchback on the ring road after the driver failed to stop at a junction. Windows down, driver produced documents; the car was checked over and both driver and passenger were allowed to continue. Street lighting was patchy; the stop took roughly fifteen minutes.',
   1, '2026-07-28T21:42:00Z', 87, 'approved'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-100000000003',
   'use_of_force', 'greater-manchester', ST_SetSRID(ST_MakePoint(-2.2426, 53.4808), 4326)::geography, 15,
   '2026-07-29T02:05:00Z',
   'Officers responded to a disturbance outside a late-night venue and took a person to the ground during arrest. Three officers were involved; the person was handcuffed and escorted to a van. Recording from a window across the street, partly obscured by the queue barrier. No obvious injuries, no ambulance called.',
   3, '2026-07-29T02:07:00Z', 203, 'approved'),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-100000000004',
   'missing_person', 'dyfed-powys', ST_SetSRID(ST_MakePoint(-4.6594, 52.0837), 4326)::geography, 50,
   '2026-07-30T11:30:00Z',
   'Police appeal in connection with a missing person report for the Cardigan area. Officers were seen taking statements at the harbour car park and pinning a notice to the community board. No further action observed during the hour we stayed. Appeal poster clearly visible in the recording.',
   NULL, '2026-07-30T11:32:00Z', 64, 'approved'),
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-100000000005',
   'arrest', 'police-scotland', ST_SetSRID(ST_MakePoint(-4.2518, 55.8642), 4326)::geography, 12,
   '2026-07-31T18:22:00Z',
   'Plain-clothes officers detained a man on the pavement outside a city-centre supermarket. He was searched, then handcuffed and placed in an unmarked car. Two officers gave what looked like a caution while a third filmed with a body camera. The man was driven away eastbound at 18:35.',
   2, '2026-07-31T18:24:00Z', 176, 'approved'),
  ('00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-100000000006',
   'traffic_collision', 'merseyside', ST_SetSRID(ST_MakePoint(-2.9916, 53.4084), 4326)::geography, 8,
   '2026-08-01T06:48:00Z',
   'Minor two-car collision at the junction, reported before the rush hour. Two officers attended, directed traffic around the damage and took details from both drivers. One driver sat in the back of a police car for a short time. Recovery truck arrived at 07:05 and the junction cleared shortly after.',
   1, '2026-08-01T06:50:00Z', 51, 'approved'),
  ('00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-100000000007',
   'stop_and_question', 'south-wales', ST_SetSRID(ST_MakePoint(-3.1791, 51.4816), 4326)::geography, 20,
   '2026-08-01T22:10:00Z',
   'A cyclist was stopped on the cycle path by a single officer and asked several questions; no search took place and the cyclist rode off after roughly ten minutes. Conversation was inaudible from the road side of the hedge, so we cannot confirm what was asked. No notebook was visible.',
   1, '2026-08-01T22:12:00Z', 39, 'approved'),
  ('00000000-0000-4000-8000-000000001008', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-100000000008',
   'other', 'thames-valley', ST_SetSRID(ST_MakePoint(-1.2577, 51.7520), 4326)::geography, 30,
   '2026-08-02T14:05:00Z',
   'Police attended a reported disturbance at a private address and spent about forty minutes on the doorstep before leaving without taking anyone away. Two occupants were seen speaking with the officers through the door. Neighbours later told us nothing came of it. No siren, no sign of a search.',
   NULL, '2026-08-02T14:08:00Z', 22, 'approved')
ON CONFLICT (id) DO NOTHING;

-- One media row per incident; sha256 is a fixed 64-hex placeholder for the dev object store.
INSERT INTO media (id, incident_id, url, type, sha256, thumbnail_url) VALUES
  ('00000000-0000-4000-8000-200000000001', '00000000-0000-4000-8000-000000001001',
   'records/00000000-0000-4000-8000-000000001001/cdd500178a5bac659dd7b0df15783f2280c9e5f920aab9a18acb5ab6d86b8588.jpg',
   'image/jpeg', 'cdd500178a5bac659dd7b0df15783f2280c9e5f920aab9a18acb5ab6d86b8588',
   'records/00000000-0000-4000-8000-000000001001/cdd500178a5bac659dd7b0df15783f2280c9e5f920aab9a18acb5ab6d86b8588.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000002', '00000000-0000-4000-8000-000000001002',
   'records/00000000-0000-4000-8000-000000001002/455237def070663d6d64ead0e6a8a460ecfbf4a3693fb9f0778c7afeb8d86c4f.jpg',
   'image/jpeg', '455237def070663d6d64ead0e6a8a460ecfbf4a3693fb9f0778c7afeb8d86c4f',
   'records/00000000-0000-4000-8000-000000001002/455237def070663d6d64ead0e6a8a460ecfbf4a3693fb9f0778c7afeb8d86c4f.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000003', '00000000-0000-4000-8000-000000001003',
   'records/00000000-0000-4000-8000-000000001003/873be74a39d0ec020014949f58d4ed35759b2b0d1ff4979812ca2f5a8a38dbb4.jpg',
   'image/jpeg', '873be74a39d0ec020014949f58d4ed35759b2b0d1ff4979812ca2f5a8a38dbb4',
   'records/00000000-0000-4000-8000-000000001003/873be74a39d0ec020014949f58d4ed35759b2b0d1ff4979812ca2f5a8a38dbb4.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000004', '00000000-0000-4000-8000-000000001004',
   'records/00000000-0000-4000-8000-000000001004/a160bdea039861b7e522b055ef8bbd2c644c218f6818719686883559074427ab.jpg',
   'image/jpeg', 'a160bdea039861b7e522b055ef8bbd2c644c218f6818719686883559074427ab',
   'records/00000000-0000-4000-8000-000000001004/a160bdea039861b7e522b055ef8bbd2c644c218f6818719686883559074427ab.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000005', '00000000-0000-4000-8000-000000001005',
   'records/00000000-0000-4000-8000-000000001005/b34d9dccbb6a90707e4ba88afe074723e530af918b1f583f204c2da765426507.jpg',
   'image/jpeg', 'b34d9dccbb6a90707e4ba88afe074723e530af918b1f583f204c2da765426507',
   'records/00000000-0000-4000-8000-000000001005/b34d9dccbb6a90707e4ba88afe074723e530af918b1f583f204c2da765426507.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000006', '00000000-0000-4000-8000-000000001006',
   'records/00000000-0000-4000-8000-000000001006/92bb2bc0ac9e822d9646ef898cebcbf45892e615c34cd0f68fd33bab08815664.jpg',
   'image/jpeg', '92bb2bc0ac9e822d9646ef898cebcbf45892e615c34cd0f68fd33bab08815664',
   'records/00000000-0000-4000-8000-000000001006/92bb2bc0ac9e822d9646ef898cebcbf45892e615c34cd0f68fd33bab08815664.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000007', '00000000-0000-4000-8000-000000001007',
   'records/00000000-0000-4000-8000-000000001007/f1956c124f2197da45da2fe004291ab102d4645b94aa69a9ed15b4868b878257.jpg',
   'image/jpeg', 'f1956c124f2197da45da2fe004291ab102d4645b94aa69a9ed15b4868b878257',
   'records/00000000-0000-4000-8000-000000001007/f1956c124f2197da45da2fe004291ab102d4645b94aa69a9ed15b4868b878257.thumb.jpg'),
  ('00000000-0000-4000-8000-200000000008', '00000000-0000-4000-8000-000000001008',
   'records/00000000-0000-4000-8000-000000001008/696b37fd59b274b65de0cb3c80e4512a99762659f6cbce10fafb77a6334b3588.jpg',
   'image/jpeg', '696b37fd59b274b65de0cb3c80e4512a99762659f6cbce10fafb77a6334b3588',
   'records/00000000-0000-4000-8000-000000001008/696b37fd59b274b65de0cb3c80e4512a99762659f6cbce10fafb77a6334b3588.thumb.jpg')
ON CONFLICT (id) DO NOTHING;

-- Collar numbers recorded for two incidents (each referencing the incident above).
INSERT INTO officers (id, incident_id, collar_number) VALUES
  ('00000000-0000-4000-8000-300000000001', '00000000-0000-4000-8000-000000001001', 'K4821'),
  ('00000000-0000-4000-8000-300000000002', '00000000-0000-4000-8000-000000001001', 'K4822'),
  ('00000000-0000-4000-8000-300000000003', '00000000-0000-4000-8000-000000001004', '4477')
ON CONFLICT (id) DO NOTHING;