import { Send } from "lucide-react";

interface MessageItem {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
}

// Shared by the dashboard project page and the client portal — a project-
// scoped message log plus a send form. `viewerType` decides which side's
// messages align right vs. left; the actual send action and its hidden
// fields (projectId for the dashboard, token for the portal) are passed in
// by the caller since the two sides authorize completely differently.
export default function MessageThread({
  messages,
  viewerType,
  action,
  hiddenFields,
}: {
  messages: MessageItem[];
  viewerType: "provider" | "client";
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Messages</h2>

      {messages.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">No messages yet.</p>
      ) : (
        <ul className="mb-3 max-h-80 space-y-2 overflow-y-auto">
          {messages.map((message) => {
            const isOwn = message.sender_type === viewerType;
            return (
              <li key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isOwn ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p className={`mt-1 text-[10px] ${isOwn ? "text-gray-300" : "text-gray-500"}`}>
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={action} className="flex items-end gap-2">
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <textarea
          name="body"
          required
          rows={2}
          maxLength={4000}
          placeholder="Write a message…"
          className="block w-full flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <button
          type="submit"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-800"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
