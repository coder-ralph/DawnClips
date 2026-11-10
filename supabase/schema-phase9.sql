-- DawnClips Phase 9: let the server (service_role) read and write the tables it uses directly.
-- The app's server routes (delete clip, moderation queue, account deletion) use the service-role key
-- with table queries such as admin.from("clips"). Earlier phases granted table access only to anon and
-- authenticated and granted service_role access to functions only. On projects where the Data API does
-- not grant privileges to new tables automatically, those queries fail with "permission denied for table",
-- which the delete route used to report as "Clip not found".
-- service_role bypasses RLS, so this does not widen what anon or authenticated users can do.
-- Safe to run more than once.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Tables created later by the same role get the same access.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
