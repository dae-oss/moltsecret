export async function onRequest(context) {
  const { params } = context;
  const id = params.id;
  
  // Fetch from Worker
  const workerUrl = `https://moltsecret-api.shellsecrets.workers.dev/c/${id}`;
  const response = await fetch(workerUrl);
  
  // Return the HTML with proper headers
  return new Response(await response.text(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
