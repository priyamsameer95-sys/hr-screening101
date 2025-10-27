import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Play, Pause, Loader2, Phone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import CandidateUpload from "@/components/campaigns/CandidateUpload";
import CallMonitor from "@/components/calls/CallMonitor";

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch campaign details
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`
          *,
          question_template:question_templates(*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  // Fetch candidates
  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Start campaign mutation
  const startCampaignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("campaigns")
        .update({ status: "ACTIVE" })
        .eq("id", id);

      if (error) throw error;

      // Initiate calls for all pending candidates
      for (const candidate of candidates.filter(c => c.status === "PENDING")) {
        await supabase.functions.invoke("initiate-call", {
          body: { candidateId: candidate.id },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      toast({
        title: "Campaign started!",
        description: "Calls are being initiated for all candidates",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error starting campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pause campaign mutation
  const pauseCampaignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("campaigns")
        .update({ status: "PAUSED" })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      toast({
        title: "Campaign paused",
        description: "No new calls will be initiated",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Campaign not found</h2>
          <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{campaign.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {campaign.position} • {campaign.status}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {campaign.status === "DRAFT" && candidates.length > 0 && (
                <Button
                  onClick={() => startCampaignMutation.mutate()}
                  disabled={startCampaignMutation.isPending}
                  className="bg-gradient-primary"
                >
                  {startCampaignMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start Campaign
                    </>
                  )}
                </Button>
              )}

              {campaign.status === "ACTIVE" && (
                <Button
                  variant="outline"
                  onClick={() => pauseCampaignMutation.mutate()}
                  disabled={pauseCampaignMutation.isPending}
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}

              {campaign.status === "PAUSED" && (
                <Button
                  onClick={() => startCampaignMutation.mutate()}
                  className="bg-gradient-primary"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <Tabs defaultValue="candidates" className="space-y-6">
          <TabsList>
            <TabsTrigger value="candidates">
              Candidates ({candidates.length})
            </TabsTrigger>
            <TabsTrigger value="calls">Calls & Monitoring</TabsTrigger>
            <TabsTrigger value="upload">Upload Candidates</TabsTrigger>
          </TabsList>

          <TabsContent value="candidates" className="space-y-4">
            {candidates.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <Phone className="h-12 w-12 text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2">No candidates yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload candidates to start screening calls
                    </p>
                  </div>
                  <Button onClick={() => navigate(`?tab=upload`)}>
                    Upload Candidates
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-6">
                <div className="space-y-4">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <h4 className="font-semibold">{candidate.full_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {candidate.phone_number} • {candidate.email}
                        </p>
                      </div>
                      <Badge>{candidate.status}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="calls">
            <CallMonitor campaignId={id!} />
          </TabsContent>

          <TabsContent value="upload">
            <CandidateUpload
              campaignId={id!}
              onUploadComplete={() => {
                queryClient.invalidateQueries({ queryKey: ["candidates", id] });
              }}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default CampaignDetail;
