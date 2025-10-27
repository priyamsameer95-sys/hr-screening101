import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface CallMonitorProps {
  campaignId: string;
}

const CallMonitor = ({ campaignId }: CallMonitorProps) => {
  // Fetch calls for this campaign
  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["calls", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select(`
          *,
          candidate:candidates(*)
        `)
        .eq("candidate.campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${campaignId}-calls`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
        },
        (payload) => {
          console.log("Call update:", payload);
          // Query will auto-refetch due to refetchInterval
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  const getStatusIcon = (status: string) => {
    const icons = {
      IN_PROGRESS: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
      COMPLETED: <CheckCircle className="h-4 w-4 text-success" />,
      FAILED: <XCircle className="h-4 w-4 text-destructive" />,
      NO_ANSWER: <Phone className="h-4 w-4 text-warning" />,
      BUSY: <Phone className="h-4 w-4 text-warning" />,
    };

    return icons[status as keyof typeof icons] || <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      SCHEDULED: "bg-muted text-muted-foreground",
      IN_PROGRESS: "bg-primary text-primary-foreground animate-pulse",
      COMPLETED: "bg-success text-success-foreground",
      FAILED: "bg-destructive text-destructive-foreground",
      NO_ANSWER: "bg-warning text-warning-foreground",
      BUSY: "bg-warning text-warning-foreground",
    };

    return (
      <Badge className={variants[status] || "bg-muted text-muted-foreground"}>
        {getStatusIcon(status)}
        <span className="ml-1">{status.replace("_", " ")}</span>
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <Card className="p-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  if (calls.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <Phone className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold mb-2">No calls yet</h3>
            <p className="text-sm text-muted-foreground">
              Calls will appear here once the campaign starts
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const activeCalls = calls.filter((c) => c.status === "IN_PROGRESS").length;
  const completedCalls = calls.filter((c) => c.status === "COMPLETED").length;
  const failedCalls = calls.filter((c) => c.status === "FAILED" || c.status === "NO_ANSWER").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Calls</p>
              <p className="text-2xl font-bold">{calls.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold">{activeCalls}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedCalls}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold">{failedCalls}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Calls Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Call History</h3>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Started At</TableHead>
                <TableHead>Attempt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call: any) => (
                <TableRow key={call.id}>
                  <TableCell className="font-medium">
                    {call.candidate?.full_name || "Unknown"}
                  </TableCell>
                  <TableCell>{call.candidate?.phone_number || "—"}</TableCell>
                  <TableCell>{getStatusBadge(call.status)}</TableCell>
                  <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell>
                    {call.started_at
                      ? new Date(call.started_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>{call.attempt_number || 1}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default CallMonitor;
