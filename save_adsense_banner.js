const PROD_API_BASE = 'https://backendapi.streamespn.org/api';
const ADMIN_CREDENTIALS = { email: 'admin@gmail.com', password: 'sohoj@sohoj' };

const adsenseCode = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9896387565016359"
     crossorigin="anonymous"></script>
<!-- Adsense -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-9896387565016359"
     data-ad-slot="3694761365"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>`;

async function save() {
  const loginRes = await fetch(PROD_API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN_CREDENTIALS),
  }).then((r) => r.json());
  const token = loginRes.data?.token;

  const current = await fetch(PROD_API_BASE + '/ads', {
    headers: { Authorization: 'Bearer ' + token },
  }).then((r) => r.json());

  const putRes = await fetch(PROD_API_BASE + '/ads', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      ...current.data?.settings,
      footerAds: adsenseCode,
    }),
  }).then((r) => r.json());

  console.log('Saved to Prod:', putRes.success, 'footerAds length:', putRes.data?.settings?.footerAds?.length);

  const check = await fetch(PROD_API_BASE + '/ads/fast').then((r) => r.json());
  console.log('Verified from /ads/fast:', Boolean(check.data?.settings?.footerAds));
}

save().catch(console.error);

