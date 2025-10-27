import { Card } from "@/components/ui/card";
import { Phone, CheckCircle, TrendingUp, Clock } from "lucide-react";

interface DashboardStatsProps {
  stats: {
    totalCalls: number;
    completedCalls: number;
    successRate: number;
    avgCallDuration: string;
  };
}

const DashboardStats = ({ stats }: DashboardStatsProps) => {
  const statCards = [
    {
      title: "Total Calls",
      value: stats.totalCalls.toLocaleString(),
      icon: Phone,
      gradient: "from-primary to-primary-glow",
      change: "+12% from last month",
    },
    {
      title: "Completed Calls",
      value: stats.completedCalls.toLocaleString(),
      icon: CheckCircle,
      gradient: "from-success to-emerald-400",
      change: "+8% from last month",
    },
    {
      title: "Success Rate",
      value: `${stats.successRate}%`,
      icon: TrendingUp,
      gradient: "from-accent to-purple-400",
      change: "+3% from last month",
    },
    {
      title: "Avg. Call Duration",
      value: stats.avgCallDuration,
      icon: Clock,
      gradient: "from-warning to-yellow-400",
      change: stats.avgCallDuration !== "0:00" ? "Based on completed calls" : "No calls yet",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statCards.map((stat, index) => (
        <Card
          key={index}
          className="p-6 bg-gradient-card border-border hover:shadow-lg transition-all duration-300"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground font-medium">
                {stat.title}
              </p>
              <p className="text-3xl font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">
                {stat.change}
              </p>
            </div>
            <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-glow`}>
              <stat.icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default DashboardStats;
