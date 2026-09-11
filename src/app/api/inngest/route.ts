import { serve } from "inngest/next";
import { inngest } from "@/integrations/inngest/client";
import { functions } from "@/integrations/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
