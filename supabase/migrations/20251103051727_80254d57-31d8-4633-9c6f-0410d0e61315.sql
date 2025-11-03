-- Add missing configuration fields to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT 'AI Assistant';

-- Update existing campaigns with default values
UPDATE public.campaigns 
SET company_name = 'Your Company'
WHERE company_name IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.campaigns.company_name IS 'Company name to be used in AI conversation prompts';
COMMENT ON COLUMN public.campaigns.agent_name IS 'AI agent name to be used in conversations (e.g., Kajal, Sarah, etc.)';