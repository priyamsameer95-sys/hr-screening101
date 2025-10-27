import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

interface CandidateUploadProps {
  campaignId: string;
  onUploadComplete: () => void;
}

interface CandidateRow {
  full_name: string;
  phone_number: string;
  email: string;
  position: string;
  preferred_call_time?: string;
  preferred_language?: string;
  current_company?: string;
  years_experience?: number;
  linkedin_url?: string;
  notes?: string;
  validation_status: "valid" | "error" | "warning";
  validation_message?: string;
}

const CandidateUpload = ({ campaignId, onUploadComplete }: CandidateUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const { toast } = useToast();

  const downloadTemplate = () => {
    const template = [
      {
        "Full Name": "John Doe",
        "Phone Number": "+919876543210",
        "Email": "john@example.com",
        "Position": "Software Engineer",
        "Preferred Call Time": "MORNING",
        "Preferred Language": "en",
        "Current Company": "Tech Corp",
        "Years Experience": "5",
        "LinkedIn URL": "https://linkedin.com/in/johndoe",
        "Notes": "Strong candidate",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    
    // Format phone number column as text to prevent scientific notation
    const phoneCol = 'B'; // Phone Number is column B
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cellAddress = phoneCol + (row + 1);
      if (ws[cellAddress]) {
        ws[cellAddress].z = '@'; // '@' is the format code for text
      }
    }
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidates");
    XLSX.writeFile(wb, "candidate_template.xlsx");

    toast({
      title: "Template downloaded",
      description: "Fill in the template and upload it back",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const parsedCandidates: CandidateRow[] = jsonData.map((row: any) => {
        // Handle phone number - convert scientific notation to string
        let phoneNumber = "";
        if (row["Phone Number"]) {
          if (typeof row["Phone Number"] === "number") {
            // Convert number to string without scientific notation
            const numStr = row["Phone Number"].toFixed(0);
            // If it starts with 91 and has 12 digits, format it properly
            if (numStr.length === 12 && numStr.startsWith("91")) {
              phoneNumber = "+" + numStr;
            } else if (numStr.length === 10) {
              // 10 digit number, add +91
              phoneNumber = "+91" + numStr;
            } else {
              // Just add + if not present
              phoneNumber = numStr.startsWith("+") ? numStr : "+" + numStr;
            }
          } else {
            phoneNumber = row["Phone Number"].toString().trim();
            // Ensure it has + prefix
            if (!phoneNumber.startsWith("+")) {
              phoneNumber = "+" + phoneNumber;
            }
          }
        }

        const candidate: CandidateRow = {
          full_name: row["Full Name"] || "",
          phone_number: phoneNumber,
          email: row["Email"] || "",
          position: row["Position"] || "",
          preferred_call_time: row["Preferred Call Time"],
          preferred_language: row["Preferred Language"] || "en",
          current_company: row["Current Company"],
          years_experience: parseInt(row["Years Experience"]) || undefined,
          linkedin_url: row["LinkedIn URL"],
          notes: row["Notes"],
          validation_status: "valid",
        };

        // Validate
        if (!candidate.full_name || !candidate.phone_number || !candidate.email) {
          candidate.validation_status = "error";
          candidate.validation_message = "Missing required fields";
        } else if (!candidate.phone_number.startsWith("+")) {
          candidate.validation_status = "warning";
          candidate.validation_message = "Phone should start with country code (+91)";
        } else if (!candidate.email.includes("@")) {
          candidate.validation_status = "error";
          candidate.validation_message = "Invalid email format";
        }

        return candidate;
      });

      setCandidates(parsedCandidates);
      toast({
        title: "File parsed successfully",
        description: `Found ${parsedCandidates.length} candidates. Review and confirm upload.`,
      });
    } catch (error) {
      toast({
        title: "Error parsing file",
        description: "Please check the file format and try again",
        variant: "destructive",
      });
    }
  };

  const confirmUpload = async () => {
    const validCandidates = candidates.filter(c => c.validation_status !== "error");
    
    if (validCandidates.length === 0) {
      toast({
        title: "No valid candidates",
        description: "Fix the errors and try again",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Remove validation fields before inserting
      const candidatesToInsert = validCandidates.map(c => {
        const { validation_status, validation_message, ...candidateData } = c;
        return {
          campaign_id: campaignId,
          ...candidateData,
        };
      });

      const { error } = await supabase.from("candidates").insert(candidatesToInsert);

      if (error) throw error;

      // Update campaign candidate count
      await supabase
        .from("campaigns")
        .update({ total_candidates: validCandidates.length })
        .eq("id", campaignId);

      toast({
        title: "Candidates uploaded!",
        description: `${validCandidates.length} candidates added to campaign`,
      });

      setCandidates([]);
      onUploadComplete();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      valid: { color: "bg-success", icon: Check },
      error: { color: "bg-destructive", icon: X },
      warning: { color: "bg-warning", icon: AlertCircle },
    };

    const config = variants[status as keyof typeof variants];
    const Icon = config?.icon;

    return (
      <Badge className={`${config?.color} text-white`}>
        {Icon && <Icon className="h-3 w-3 mr-1" />}
        {status}
      </Badge>
    );
  };

  return (
    <Card className="p-6 bg-gradient-card">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Upload Candidates</h3>
          <p className="text-sm text-muted-foreground">
            Download the template, fill it with candidate details, and upload it back
          </p>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>

          <div>
            <Input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Label htmlFor="file-upload">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </span>
              </Button>
            </Label>
          </div>
        </div>

        {candidates.length > 0 && (
          <>
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((candidate, index) => (
                    <TableRow key={index}>
                      <TableCell>{getStatusBadge(candidate.validation_status)}</TableCell>
                      <TableCell>{candidate.full_name}</TableCell>
                      <TableCell>{candidate.phone_number}</TableCell>
                      <TableCell>{candidate.email}</TableCell>
                      <TableCell>{candidate.position}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {candidate.validation_message || "OK"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Valid: {candidates.filter(c => c.validation_status === "valid").length} |
                Warnings: {candidates.filter(c => c.validation_status === "warning").length} |
                Errors: {candidates.filter(c => c.validation_status === "error").length}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCandidates([])}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmUpload}
                  disabled={uploading || candidates.filter(c => c.validation_status !== "error").length === 0}
                  className="bg-gradient-primary"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    `Confirm & Upload (${candidates.filter(c => c.validation_status !== "error").length})`
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

export default CandidateUpload;
