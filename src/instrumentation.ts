export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./server/bootstrap");
    try {
      await bootstrap();
    } catch (err) {
      console.error("[bootstrap] Fehler beim Start:", err);
    }
  }
}
