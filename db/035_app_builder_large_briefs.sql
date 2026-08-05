-- App Builder briefs upload directly to private Blob storage so they are no
-- longer constrained by the 4.5 MB Vercel Function request-body limit.

alter table app_builder_request_files
  add column blob_url text,
  alter column pdf_bytes drop not null,
  drop constraint app_builder_request_files_byte_size_check,
  add constraint app_builder_request_files_byte_size_check
    check (byte_size between 5 and 209715200),
  add constraint app_builder_request_files_source_check
    check ((pdf_bytes is not null) <> (blob_url is not null)),
  add constraint app_builder_request_files_blob_url_check
    check (blob_url is null or blob_url ~ '^https://[A-Za-z0-9.-]+\\.blob\\.vercel-storage\\.com/');

alter table app_builder_requests
  drop constraint app_builder_requests_agent_turn_check,
  add constraint app_builder_requests_agent_turn_check check (agent_turn >= 0);
