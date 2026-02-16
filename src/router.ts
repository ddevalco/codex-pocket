import { createRouter } from "sv-router";

export const { navigate, route } = createRouter({
  "/": () => import("./routes/Landing.svelte"),
  "/app": () => import("./routes/Home.svelte"),
  "/task": () => import("./routes/NewTask.svelte"),
  "/thread/:id": () => import("./routes/Thread.svelte"),
  "/thread/:id/review": () => import("./routes/Review.svelte"),
  "/settings": () => import("./routes/Settings.svelte"),
  "/device": () => import("./routes/Device.svelte"),
  "/admin": () => import("./routes/Admin.svelte"),
  "/pair": () => import("./routes/Pair.svelte"),
});
