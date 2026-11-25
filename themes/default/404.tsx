export default function NotFound() {
  return (
    <main className="site error-404">
      <h1>404</h1>
      <h2>Page Not Found</h2>
      <p>Sorry, we couldn't find the page you're looking for.</p>
      <a href="/" className="btn btn-primary">Go Home</a>
    </main>
  );
}