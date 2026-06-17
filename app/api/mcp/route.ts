//import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "mcp-handler"; // Vercel utility for routing MCP via HTTP
import { google } from "googleapis";
import { z } from "zod";

// Helper to initialize Google Auth
function getGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

// Export the GET and POST handlers using the correct mcp-handler structure
const handler = createMcpHandler(
  (server) => {
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

          // Create blank doc
          const doc = await docs.documents.create({ requestBody: { title } });
          const documentId = doc.data.documentId;

          // Insert text cleanly using type assertion to bypass strict nested Google API signatures
          if (documentId) {
            await (docs.documents.batchUpdate as any)({
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

    // --- TOOL 3: Send Gmail Email ---
    server.tool(
      "send_email",
      { recipient_email: z.string(), subject: z.string(), body_html: z.string() },
      async ({ recipient_email, subject, body_html }) => {
        try {
          const auth = getGoogleAuth();
          const gmail = google.gmail({ version: "v1", auth });

          const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
          const messageParts = [
            `To: ${recipient_email}`,
            "Content-Type: text/html; charset=utf-8",
            "MIME-Version: 1.0",
            `Subject: ${utf8Subject}`,
            "",
            body_html,
          ];
          const message = messageParts.join("\n");
          const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          const response = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: encodedMessage,
            },
          });

          return {
            content: [{ type: "text", text: `Successfully sent email! ID: ${response.data.id}` }],
          };
        } catch (error: any) {
          return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
      }
    );
  },
  {}, // Middleware/Auth overrides (empty for personal setup)
  { basePath: "/api", maxDuration: 60 } // Essential Vercel serverless configurations
);

export { handler as GET, handler as POST };