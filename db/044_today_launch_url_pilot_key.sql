-- Today launch URL (Nicola, 26 Aug): the app is gated by TODAY_ACCESS_KEY
-- until Cove SSO harmonisation, so the Cove tile must launch through the
-- gate. Cove itself is behind SSO and only entitled users see the tile.
-- If the key rotates, update this URL too (and vice versa).

update applications
   set launch_url = 'https://leatherback-today.vercel.app/?key=e5b7e1ced2d8fd73330c542d394ed0e4',
       updated_at = now()
 where slug = 'today';
