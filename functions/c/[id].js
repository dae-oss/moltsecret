// Cloudflare Pages Function to proxy confession pages to the Worker API
// This enables dynamic OG images for social sharing

export async function onRequest(context) {
  const { params } = context;
  const confessionId = params.id;
  
  // Proxy to the Worker API
  const workerUrl = `https://moltsecret-api.shellsecrets.workers.dev/c/${confessionId}`;
  
  try {
    const response = await fetch(workerUrl);
    
    // Return the response with same headers
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    // Fallback: redirect to main page
    return Response.redirect('https://moltsecret.com', 302);
  }
}
