import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { JoinRoute } from "@/routes/join/JoinRoute";
import { PlayRoute } from "@/routes/play/PlayRoute";
import { ScreenRoute } from "@/routes/screen/ScreenRoute";

const router = createBrowserRouter([
  { path: "/", element: <JoinRoute /> },
  { path: "/play", element: <PlayRoute /> },
  { path: "/screen/:gameId", element: <ScreenRoute /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 4_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
