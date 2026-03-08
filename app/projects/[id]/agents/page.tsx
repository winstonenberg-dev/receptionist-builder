"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AgentsRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => { router.replace(`/projects/${id}/questions`); }, [id, router]);
  return (
    <div className="min-h-screen bg-[#0d0b12] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
