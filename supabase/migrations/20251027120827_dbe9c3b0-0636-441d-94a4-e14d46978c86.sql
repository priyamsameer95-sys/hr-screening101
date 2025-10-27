-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'RECRUITER' CHECK (role IN ('ADMIN', 'MANAGER', 'RECRUITER', 'VIEWER')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create question templates table
CREATE TABLE public.question_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  role_category TEXT,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES public.question_templates(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('OPEN_ENDED', 'YES_NO', 'MULTIPLE_CHOICE', 'NUMERIC')),
  expected_answer_type TEXT,
  is_mandatory BOOLEAN DEFAULT true,
  sequence_order INTEGER,
  estimated_duration_seconds INTEGER,
  follow_up_logic JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  question_template_id UUID REFERENCES public.question_templates(id),
  retry_policy JSONB DEFAULT '{"maxAttempts": 3, "intervalHours": [0, 4, 24]}'::jsonb,
  voice_settings JSONB DEFAULT '{"voiceId": "21m00Tcm4TlvDq8ikWAM", "language": "en"}'::jsonb,
  total_candidates INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0
);

-- Create candidates table
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  position TEXT NOT NULL,
  preferred_call_time TEXT,
  preferred_language TEXT DEFAULT 'en',
  current_company TEXT,
  years_experience INTEGER,
  linkedin_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SCHEDULED', 'CALLING', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'RESCHEDULED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, phone_number)
);

-- Create calls table
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  conversation_id TEXT,
  call_sid TEXT,
  attempt_number INTEGER DEFAULT 1,
  status TEXT CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY', 'ABANDONED')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript_url TEXT,
  cost_credits DECIMAL(10,4),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  speaker TEXT NOT NULL CHECK (speaker IN ('AGENT', 'CANDIDATE')),
  text TEXT NOT NULL,
  confidence DECIMAL(3,2),
  sequence_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create structured responses table
CREATE TABLE public.structured_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id),
  question_text TEXT NOT NULL,
  raw_response TEXT,
  extracted_value JSONB,
  confidence_score DECIMAL(3,2),
  red_flags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create AI recommendations table
CREATE TABLE public.ai_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  recommendation TEXT CHECK (recommendation IN ('PROCEED', 'REJECT', 'MAYBE')),
  reasoning TEXT,
  engagement_score INTEGER CHECK (engagement_score BETWEEN 1 AND 10),
  qualification_score INTEGER CHECK (qualification_score BETWEEN 1 AND 10),
  red_flags TEXT[],
  strengths TEXT[],
  suggested_next_steps TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structured_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for question_templates (all authenticated users can view)
CREATE POLICY "Authenticated users can view templates"
  ON public.question_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create templates"
  ON public.question_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for questions
CREATE POLICY "Authenticated users can view questions"
  ON public.questions FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for campaigns
CREATE POLICY "Users can view their campaigns"
  ON public.campaigns FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create campaigns"
  ON public.campaigns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their campaigns"
  ON public.campaigns FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their campaigns"
  ON public.campaigns FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- RLS Policies for candidates
CREATE POLICY "Users can view candidates in their campaigns"
  ON public.candidates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = candidates.campaign_id
      AND campaigns.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert candidates in their campaigns"
  ON public.candidates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_id
      AND campaigns.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update candidates in their campaigns"
  ON public.candidates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = candidates.campaign_id
      AND campaigns.created_by = auth.uid()
    )
  );

-- RLS Policies for calls
CREATE POLICY "Users can view calls for their candidates"
  ON public.calls FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      JOIN public.campaigns ON campaigns.id = candidates.campaign_id
      WHERE candidates.id = calls.candidate_id
      AND campaigns.created_by = auth.uid()
    )
  );

-- RLS Policies for transcripts
CREATE POLICY "Users can view transcripts for their calls"
  ON public.transcripts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calls
      JOIN public.candidates ON candidates.id = calls.candidate_id
      JOIN public.campaigns ON campaigns.id = candidates.campaign_id
      WHERE calls.id = transcripts.call_id
      AND campaigns.created_by = auth.uid()
    )
  );

-- RLS Policies for structured_responses
CREATE POLICY "Users can view responses for their calls"
  ON public.structured_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calls
      JOIN public.candidates ON candidates.id = calls.candidate_id
      JOIN public.campaigns ON campaigns.id = candidates.campaign_id
      WHERE calls.id = structured_responses.call_id
      AND campaigns.created_by = auth.uid()
    )
  );

-- RLS Policies for ai_recommendations
CREATE POLICY "Users can view recommendations for their calls"
  ON public.ai_recommendations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calls
      JOIN public.candidates ON candidates.id = calls.candidate_id
      JOIN public.campaigns ON campaigns.id = candidates.campaign_id
      WHERE calls.id = ai_recommendations.call_id
      AND campaigns.created_by = auth.uid()
    )
  );

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_question_templates_updated_at BEFORE UPDATE ON public.question_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default question templates
INSERT INTO public.question_templates (name, description, role_category, is_default) VALUES
('Software Engineer', 'Standard screening questions for software engineering positions', 'Engineering', true),
('Marketing Manager', 'Screening questions for marketing management roles', 'Marketing', true),
('Sales Executive', 'Standard screening for sales positions', 'Sales', true);

-- Insert default questions for Software Engineer template
INSERT INTO public.questions (template_id, question_text, question_type, expected_answer_type, is_mandatory, sequence_order, estimated_duration_seconds)
SELECT 
  (SELECT id FROM public.question_templates WHERE name = 'Software Engineer' LIMIT 1),
  question_text,
  question_type,
  expected_answer_type,
  is_mandatory,
  sequence_order,
  estimated_duration_seconds
FROM (VALUES
  ('Could you please introduce yourself and tell me about your current role?', 'OPEN_ENDED', 'text', true, 1, 120),
  ('What is your notice period?', 'OPEN_ENDED', 'text', true, 2, 30),
  ('Why are you looking for a change?', 'OPEN_ENDED', 'text', true, 3, 120),
  ('What are your primary technical skills and years of experience with each?', 'OPEN_ENDED', 'text', true, 4, 120),
  ('What is your current CTC and expected salary?', 'OPEN_ENDED', 'text', true, 5, 30),
  ('Can you describe a challenging project you have worked on recently?', 'OPEN_ENDED', 'text', true, 6, 180),
  ('Are you comfortable with the position location and work mode?', 'YES_NO', 'boolean', true, 7, 30),
  ('When would you be available for the next round of interviews?', 'OPEN_ENDED', 'text', true, 8, 30)
) AS t(question_text, question_type, expected_answer_type, is_mandatory, sequence_order, estimated_duration_seconds);
