import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const data = await request.json();
        const { type, prompt } = data;

        let response;
        if (type === 'create-track') {
            response = {
                suggestion: 'How about a 128 BPM Future Bass track with a lush saw pad and syncopated drums?',
                patch: {
                    tempo: 128,
                    key: 'C Minor',
                    tracks: [
                        { name: 'Drums', patches: ['808 Kit'] },
                        { name: 'Bass', patches: ['Sync Bass'] },
                        { name: 'Chords', patches: ['Super Saw'] }
                    ]
                }
            };
        } else {
            response = {
                suggestion: `I've generated some ideas based on: "${prompt}"`,
                data: []
            };
        }

        return NextResponse.json(response);
    } catch {
        return NextResponse.json({ error: 'Failed to process preview' }, { status: 500 });
    }
}
