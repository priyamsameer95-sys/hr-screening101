import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Users, TrendingUp, Calendar, Plus, Play, Pause } from "lucide-react";
import DashboardStats from "@/components/dashboard/DashboardStats";
import CampaignList from "@/components/dashboard/CampaignList";
import CreateCampaignDialog from "@/components/campaigns/CreateCampaignDialog";

const Index = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Mock data for demo
  const stats = {
    totalCalls: 1247,
    completedCalls: 1089,
    successRate: 87,
    avgCallDuration: "12:34",
  };

  const campaigns = [
    {
      id: "1",
      name: "Software Engineer Q4 2025",
      position: "Senior Software Engineer",
      status: "active" as const,
      totalCandidates: 247,
      completedCalls: 189,
      successRate: 92,
      createdAt: "2025-10-15",
    },
    {
      id: "2",
      name: "Marketing Manager Batch 2",
      position: "Marketing Manager",
      status: "paused" as const,
      totalCandidates: 156,
      completedCalls: 78,
      successRate: 85,
      createdAt: "2025-10-20",
    },
    {
      id: "3",
      name: "Sales Executive - Mumbai",
      position: "Sales Executive",
      status: "completed" as const,
      totalCandidates: 98,
      completedCalls: 98,
      successRate: 89,
      createdAt: "2025-10-01",
    },
  ];

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
                <p className="text-sm text-muted-foreground">Powered by Kajal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                View Calendar
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
                campaigns={campaigns.filter(c => c.status === "active")} 
              />
            </TabsContent>
            <TabsContent value="paused" className="space-y-4">
              <CampaignList 
                campaigns={campaigns.filter(c => c.status === "paused")} 
              />
            </TabsContent>
            <TabsContent value="completed" className="space-y-4">
              <CampaignList 
                campaigns={campaigns.filter(c => c.status === "completed")} 
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
