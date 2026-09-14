import { createFileRoute } from "@tanstack/react-router";
import { DownloadsPageContent } from "@/components/DownloadsPageContent";

export const Route = createFileRoute("/")({
  component: DownloadsPageContent,
});
