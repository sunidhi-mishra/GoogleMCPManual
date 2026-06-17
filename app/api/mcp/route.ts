import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpHandler } from "mcp-handler"; // Vercel utility for routing MCP via HTTP
import { google } from "googleapis";
import { z } from "zod";

// Initialize the MCP server
const server = new McpServer({
  name: "google-workspace-mcp",
  version: "1.0.0",
});

// Helper to initialize Google Auth
function getGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  // For production serverless, you will pass a refresh token via environment variables 
  // or a quick database connection. For this walkthrough, we assume a static token variable.
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

// --- TOOL 1: Read Latest Gmail Threads ---
server.tool(
  "list_emails",
  { maxResults: z.number().optional().default(5) },
  async ({ maxResults }) => {
    try {
      const auth = getGoogleAuth();
      const gmail = google.gmail({ version: "v1", auth });
      const response = await gmail.users.messages.list({ userId: "me", maxResults });
      
      return {
        content: [{ type: "text", text: JSON.stringify(response.data.messages || []) }],
      };
    } catch (error: any) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// --- TOOL 2: Create a Google Doc ---
server.tool(
  "create_document",
  { title: z.string(), content: z.string() },
  async ({ title, content }) => {
    try {
      const auth = getGoogleAuth();
      const docs = google.docs({ version: "v1", auth });
      const drive = google.drive({ version: "v3", auth });

      // Create blank doc
      const doc = await docs.documents.create({ requestBody: { title } });
      const documentId = doc.data.documentId;

      // Insert text
      if (documentId) {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{ insertText: { endOfSectionIndex: { segmentId: "" }, text: content } }],
          },
        });
      }

      return {
        content: [{ type: "text", text: `Successfully created document! ID: ${documentId}` }],
      };
    } catch (error: any) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Export the GET and POST handlers for Vercel Functions
const handler = mcpHandler(server);
export { handler as GET, handler as POST };
