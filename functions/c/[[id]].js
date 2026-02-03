// Proxy confession pages to the Worker API for OG tags
export async function onRequest(context) {
  const { params } = context;
  const id = params.id;
  
  // Fetch from the Worker API
  const response = await fetch(`https://moltsecret-api.shellsecrets.workers.dev/c/${id}`);
  
  // Return the response with same headers
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
