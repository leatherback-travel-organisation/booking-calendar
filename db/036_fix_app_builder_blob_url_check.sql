-- Migration 035 wrote the blob_url pattern with doubled backslashes. Under
-- standard_conforming_strings both backslashes are stored literally, so the
-- regex required a literal backslash inside the URL and rejected every real
-- Blob URL — no Blob-backed brief was ever recorded. Store the intended
-- pattern with single backslashes.
alter table app_builder_request_files
  drop constraint app_builder_request_files_blob_url_check,
  add constraint app_builder_request_files_blob_url_check
    check (blob_url is null or blob_url ~ '^https://[A-Za-z0-9.-]+\.blob\.vercel-storage\.com/');
