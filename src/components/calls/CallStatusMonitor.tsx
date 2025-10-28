import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Call {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  call_sid: string | null;
  candidate_id: string;
  candidate: {
    full_name: string;
    phone_number: string;
  };
}

interface CallStatusMonitorProps {
  campaignId: string;
}

export const CallStatusMonitor = ({ campaignId }: CallStatusMonitorProps) => {
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchActiveCalls = async () => {
    try {
      const { data, error } = await supabase
        .from("calls")
        .select(`
          id,
          status,
          started_at,
          ended_at,
          duration_seconds,
          error_message,
          call_sid,
          candidate_id,
          candidate:candidates!inner(
            full_name,
            phone_number,
            campaign_id
          )
        `)
        .eq("candidate.campaign_id", campaignId)
        .in("status", ["IN_PROGRESS", "SCHEDULED"])
        .order("started_at", { ascending: false });

      if (error) throw error;
      setActiveCalls(data || []);
    } catch (error) {
      console.error("Error fetching active calls:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveCalls();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("call-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
        },
        (payload) => {
          console.log("Call update:", payload);
          fetchActiveCalls();
        }
      )
      .subscribe();

    // Refresh every 10 seconds
    const interval = setInterval(fetchActiveCalls, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [campaignId]);

  const handleRetryCall = async (candidateId: string) => {
    try {
      const { error } = await supabase.functions.invoke("initiate-call", {
        body: { candidateId },
      });

      if (error) throw error;

      toast({
        title: "Call Retry Initiated",
        description: "The call is being retried.",
      });

      fetchActiveCalls();
    } catch (error) {
      console.error("Error retrying call:", error);
      toast({
        title: "Retry Failed",
        description: "Failed to retry the call. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return <Phone className="h-4 w-4 animate-pulse" />;
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4" />;
      case "FAILED":
        return <XCircle className="h-4 w-4" />;
      case "NO_ANSWER":
        return <PhoneOff className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return "default";
      case "COMPLETED":
        return "default";
      case "FAILED":
        return "destructive";
      case "NO_ANSWER":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getCallDuration = (call: Call) => {
    if (call.duration_seconds) {
      return `${call.duration_seconds}s`;
    }
    if (call.started_at && !call.ended_at) {
      const start = new Date(call.started_at);
      const now = new Date();
      const diffSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
      return `${diffSeconds}s (ongoing)`;
    }
    return "N/A";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading Active Calls...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (activeCalls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No active calls at the moment.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Active Calls ({activeCalls.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeCalls.map((call) => (
          <div
            key={call.id}
            className="flex items-center justify-between p-4 border rounded-lg bg-muted/50"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={getStatusColor(call.status)} className="flex items-center gap-1">
                  {getStatusIcon(call.status)}
                  {call.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="font-medium">{call.candidate.full_name}</p>
              <p className="text-sm text-muted-foreground">{call.candidate.phone_number}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Duration: {getCallDuration(call)}
              </p>
              {call.error_message && (
                <p className="text-xs text-destructive mt-1">{call.error_message}</p>
              )}
            </div>
            {call.status === "FAILED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRetryCall(call.candidate_id)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
