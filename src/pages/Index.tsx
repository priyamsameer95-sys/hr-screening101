import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Users, TrendingUp, Calendar, Plus, Play, Pause, LogOut, Loader2 } from "lucide-react";
import DashboardStats from "@/components/dashboard/DashboardStats";
import CampaignList from "@/components/dashboard/CampaignList";
import CreateCampaignDialog from "@/components/campaigns/CreateCampaignDialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const Index = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Calculate stats from real data
  const stats = {
    totalCalls: campaigns.reduce((sum, c) => sum + (c.total_candidates || 0), 0),
    completedCalls: campaigns.reduce((sum, c) => sum + (c.completed_calls || 0), 0),
    successRate: campaigns.length > 0
      ? Math.round(
          (campaigns.reduce((sum, c) => sum + (c.successful_calls || 0), 0) /
            Math.max(campaigns.reduce((sum, c) => sum + (c.completed_calls || 0), 0), 1)) *
            100
        )
      : 0,
    avgCallDuration: "12:34", // This would need call data
  };

  if (authLoading || campaignsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Phone className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  HR Screening AI
                </h1>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-muted-foreground">Powered by</p>
                  <span className="text-sm font-semibold text-foreground">ElevenLabs</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
              <Button 
                onClick={() => setIsCreateDialogOpen(true)}
                className="bg-gradient-primary hover:opacity-90"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Stats Overview */}
        <DashboardStats stats={stats} />

        {/* Campaigns Section */}
        <div className="mt-8">
          <Tabs defaultValue="active" className="space-y-6">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="paused">Paused</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="all">All Campaigns</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  Export All
                </Button>
              </div>
            </div>

            <TabsContent value="active" className="space-y-4">
              <CampaignList 
                campaigns={campaigns.filter((c: any) => c.status === "ACTIVE")} 
              />
            </TabsContent>
            <TabsContent value="paused" className="space-y-4">
              <CampaignList 
                campaigns={campaigns.filter((c: any) => c.status === "PAUSED")} 
              />
            </TabsContent>
            <TabsContent value="completed" className="space-y-4">
              <CampaignList 
                campaigns={campaigns.filter((c: any) => c.status === "COMPLETED")} 
              />
            </TabsContent>
            <TabsContent value="all" className="space-y-4">
              <CampaignList campaigns={campaigns} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <CreateCampaignDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
};

export default Index;
