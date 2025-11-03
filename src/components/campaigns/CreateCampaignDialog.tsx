import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateCampaignDialog = ({ open, onOpenChange }: CreateCampaignDialogProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    position: "",
    description: "",
    companyName: "",
    agentName: "AI Assistant",
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    template: "",
    maxAttempts: "3",
    voice: "kajal",
    language: "en",
  });

  const handleNext = () => {
    setStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleCreate = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Get the selected template
      const { data: templates } = await supabase
        .from("question_templates")
        .select("id")
        .eq("name", formData.template === "software" ? "Software Engineer" : 
                     formData.template === "marketing" ? "Marketing Manager" : 
                     "Sales Executive")
        .single();

      // Create campaign
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          name: formData.name,
          position: formData.position,
          description: formData.description || null,
          company_name: formData.companyName || "Your Company",
          agent_name: formData.agentName || "AI Assistant",
          scheduled_start: formData.startDate?.toISOString(),
          scheduled_end: formData.endDate?.toISOString(),
          question_template_id: templates?.id,
          status: "DRAFT",
          created_by: user.id,
          retry_policy: {
            maxAttempts: parseInt(formData.maxAttempts),
            intervalHours: [0, 4, 24],
          },
          voice_settings: {
            voiceId: formData.voice === "kajal" ? "21m00Tcm4TlvDq8ikWAM" : "other_voice_id",
            language: formData.language,
          },
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Campaign created!",
        description: "Your campaign has been created successfully. Now upload candidates to start.",
      });

      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onOpenChange(false);
      setStep(1);
      setFormData({
        name: "",
        position: "",
        description: "",
        companyName: "",
        agentName: "AI Assistant",
        startDate: undefined,
        endDate: undefined,
        template: "",
        maxAttempts: "3",
        voice: "kajal",
        language: "en",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
            Create New Campaign
          </DialogTitle>
          <DialogDescription>
            Step {step} of 4: {step === 1 && "Basic Details"}
            {step === 2 && "Question Template"}
            {step === 3 && "Call Settings"}
            {step === 4 && "Review & Create"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-2 flex-1 rounded-full transition-all duration-300",
                  s <= step ? "bg-gradient-primary" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Step 1: Basic Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Software Engineer Q4 2025"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">Position *</Label>
                <Input
                  id="position"
                  placeholder="e.g., Senior Software Engineer"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the campaign..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    placeholder="e.g., Acme Corp"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentName">AI Agent Name</Label>
                  <Input
                    id="agentName"
                    placeholder="e.g., Sarah, Alex"
                    value={formData.agentName}
                    onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.startDate ? format(formData.startDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.startDate}
                        onSelect={(date) => setFormData({ ...formData, startDate: date })}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.endDate ? format(formData.endDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.endDate}
                        onSelect={(date) => setFormData({ ...formData, endDate: date })}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Question Template */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Question Template *</Label>
                <Select
                  value={formData.template}
                  onValueChange={(value) => setFormData({ ...formData, template: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="software">Software Engineer (8 questions, ~12 min)</SelectItem>
                    <SelectItem value="marketing">Marketing Manager (7 questions, ~10 min)</SelectItem>
                    <SelectItem value="sales">Sales Executive (9 questions, ~15 min)</SelectItem>
                    <SelectItem value="custom">Custom Template</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.template && (
                <div className="p-4 rounded-lg border border-border bg-muted/50">
                  <h4 className="font-semibold mb-3">Preview: Software Engineer Template</h4>
                  <ol className="space-y-2 text-sm">
                    <li>1. Tell me about your current role (2 min)</li>
                    <li>2. What is your notice period? (30 sec)</li>
                    <li>3. Why are you looking for a change? (2 min)</li>
                    <li>4. What are your primary technical skills? (2 min)</li>
                    <li>5. Expected salary? (30 sec)</li>
                    <li className="text-muted-foreground">... (3 more questions)</li>
                  </ol>
                  <Button variant="link" className="mt-2 p-0 h-auto">
                    Edit Template
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Call Settings */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Max Call Attempts</Label>
                <Select
                  value={formData.maxAttempts}
                  onValueChange={(value) => setFormData({ ...formData, maxAttempts: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 attempt</SelectItem>
                    <SelectItem value="2">2 attempts</SelectItem>
                    <SelectItem value="3">3 attempts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voice Agent</Label>
                <Select
                  value={formData.voice}
                  onValueChange={(value) => setFormData({ ...formData, voice: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kajal">Kajal - Professional Female</SelectItem>
                    <SelectItem value="amit">Amit - Professional Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value) => setFormData({ ...formData, language: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-6 rounded-lg border border-border bg-gradient-card">
                <h4 className="font-semibold mb-4 text-lg">Campaign Summary</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Position:</span>
                    <span className="font-medium">{formData.position}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">
                      {formData.startDate && format(formData.startDate, "MMM d")} -{" "}
                      {formData.endDate && format(formData.endDate, "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template:</span>
                    <span className="font-medium">Software Engineer (8 questions)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Attempts:</span>
                    <span className="font-medium">{formData.maxAttempts}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {step < 4 ? (
            <Button onClick={handleNext} className="bg-gradient-primary">
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button 
              onClick={handleCreate} 
              className="bg-gradient-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Campaign"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCampaignDialog;
