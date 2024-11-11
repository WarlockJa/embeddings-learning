export interface Env {
	VECTORIZE: Vectorize;
	AI: Ai;
	ACCESS_KEY: string;
}
interface EmbeddingResponse {
	shape: number[];
	data: number[][];
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// checking for accesskey header
		const headers = new Headers(request.headers);
		const keyHeader = headers.get('x-access-key');
		if (keyHeader !== env.ACCESS_KEY) {
			return new Response('access denied', { status: 403 });
		}

		// checking for params
		const url = new URL(request.url);
		// query param for vectorized search
		const query = url.searchParams.get('query');
		// id param for the query
		const id = url.searchParams.get('id');

		if (!query) {
			return new Response('insufficient data', { status: 400 });
		}

		const path = url.pathname;
		if (path.startsWith('/favicon')) {
			return new Response('', { status: 404 });
		}

		// You only need to generate vector embeddings once (or as
		// data changes), not on every request
		if (path === '/insert') {
			if (!id) {
				return new Response('insufficient data', { status: 400 });
			}
			// In a real-world application, you could read content from R2 or
			// a SQL database (like D1) and pass it to Workers AI
			const modelResp: EmbeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
				text: [query],
			});

			// Convert the vector embeddings into a format Vectorize can accept.
			// Each vector needs an ID, a value (the vector) and optional metadata.
			// In a real application, your ID would be bound to the ID of the source
			// document.
			const vectors: VectorizeVector[] = [{ id, values: modelResp.data[0] }];

			let inserted = await env.VECTORIZE.upsert(vectors);
			return Response.json({ inserted, query, id });
		}

		// Your query: expect this to match vector ID.
		let userQuery = query;
		const queryVector: EmbeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
			text: [userQuery],
		});

		let matches = await env.VECTORIZE.query(queryVector.data[0], {
			topK: 5,
		});
		return Response.json({
			// This tutorial uses a cosine distance metric, where the closer to one,
			// the more similar.
			matches: matches,
			query,
			path,
		});
	},
} satisfies ExportedHandler<Env>;
