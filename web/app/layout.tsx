import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Policy / Studio",
  description: "Build, inspect, and run explainable policies.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
