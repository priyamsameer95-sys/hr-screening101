-- Create storage bucket for candidate Excel/CSV files
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-uploads', 'candidate-uploads', false);

-- Storage policies for candidate uploads
CREATE POLICY "Authenticated users can upload candidates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'candidate-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for calls and candidates tables
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.candidates REPLICA IDENTITY FULL;
ALTER TABLE public.campaigns REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
