import { createFileRoute } from "@tanstack/react-router";

const RESEND_API_URL = "https://api.resend.com/emails";

type ContactPayload = {
	name: string;
	email: string;
	message: string;
};

const getEnv = (key: string) => process.env[key]?.trim() ?? "";

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");

const parsePayload = async (request: Request): Promise<ContactPayload> => {
	const formData = await request.formData();

	return {
		name: String(formData.get("name") ?? "").trim(),
		email: String(formData.get("email") ?? "").trim(),
		message: String(formData.get("message") ?? "").trim(),
	};
};

const isValidEmail = (email: string) =>
	/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const Route = createFileRoute("/api/contact")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) => {
				const payload = await parsePayload(request);

				if (!payload.name || !payload.email || !payload.message) {
					return Response.json(
						{ message: "Name, email, and message are required." },
						{ status: 400 },
					);
				}

				if (!isValidEmail(payload.email)) {
					return Response.json(
						{ message: "Please provide a valid email address." },
						{ status: 400 },
					);
				}

				const apiKey = getEnv("RESEND_API_KEY");
				const from = getEnv("CONTACT_FROM_EMAIL");
				const to = getEnv("CONTACT_TO_EMAIL");

				if (!apiKey || !from || !to) {
					return Response.json(
						{ message: "Contact email is not configured." },
						{ status: 500 },
					);
				}

				const safeName = escapeHtml(payload.name);
				const safeEmail = escapeHtml(payload.email);
				const safeMessage = escapeHtml(payload.message).replaceAll("\n", "<br />");

				const response = await fetch(RESEND_API_URL, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						from,
						to: [to],
						reply_to: payload.email,
						subject: `Portfolio message from ${payload.name}`,
						html: `
							<h2>New portfolio contact message</h2>
							<p><strong>Name:</strong> ${safeName}</p>
							<p><strong>Email:</strong> ${safeEmail}</p>
							<p><strong>Message:</strong></p>
							<p>${safeMessage}</p>
						`,
					}),
				});

				if (!response.ok) {
					return Response.json(
						{ message: "Could not send message." },
						{ status: 502 },
					);
				}

				return Response.json({ message: "Message sent." });
			},
		},
	},
});
