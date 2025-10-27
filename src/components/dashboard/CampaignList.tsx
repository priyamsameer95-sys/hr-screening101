import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, FileText, Upload, Users } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  position: string;
  status: string;
  total_candidates: number;
  completed_calls: number;
  successful_calls: number;
  created_at: string;
}

interface CampaignListProps {
  campaigns: Campaign[];
}

const CampaignList = ({ campaigns }: CampaignListProps) => {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      ACTIVE: "bg-success text-success-foreground",
      PAUSED: "bg-warning text-warning-foreground",
      COMPLETED: "bg-muted text-muted-foreground",
      DRAFT: "bg-muted text-muted-foreground",
    };

    return (
      <Badge className={variants[status] || "bg-muted text-muted-foreground"}>
        {status.charAt(0) + status.slice(1).toLowerCase()}
      </Badge>
    );
  };

  const getProgress = (completed: number, total: number) => {
    return total > 0 ? (completed / total) * 100 : 0;
  };

  const getSuccessRate = (successful: number, completed: number) => {
    return completed > 0 ? Math.round((successful / completed) * 100) : 0;
  };

  if (campaigns.length === 0) {
    return (
      <Card className="p-12 text-center bg-gradient-card">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">No campaigns found</h3>
            <p className="text-sm text-muted-foreground">
              Create your first campaign to start screening candidates
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {campaigns.map((campaign) => (
        <Card key={campaign.id} className="p-6 bg-gradient-card hover:shadow-lg transition-all duration-300">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold">{campaign.name}</h3>
                {getStatusBadge(campaign.status)}
              </div>
              <p className="text-sm text-muted-foreground">
                Position: {campaign.position}
              </p>
              <p className="text-xs text-muted-foreground">
                Created: {new Date(campaign.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              {campaign.status === "ACTIVE" && (
                <Button size="sm" variant="outline">
                  <Pause className="h-4 w-4 mr-1" />
                  Pause
                </Button>
              )}
              {campaign.status === "PAUSED" && (
                <Button size="sm" className="bg-gradient-primary">
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </Button>
              )}
              <Button size="sm" variant="outline">
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4 mr-1" />
                Report
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Candidates</p>
              <p className="text-2xl font-bold">{campaign.total_candidates || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Completed Calls</p>
              <p className="text-2xl font-bold">{campaign.completed_calls || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold">
                {getSuccessRate(campaign.successful_calls || 0, campaign.completed_calls || 0)}%
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {campaign.completed_calls || 0} / {campaign.total_candidates || 0}
              </span>
            </div>
            <Progress 
              value={getProgress(campaign.completed_calls || 0, campaign.total_candidates || 0)} 
              className="h-2"
            />
          </div>
        </Card>
      ))}
    </div>
  );
};

export default CampaignList;
