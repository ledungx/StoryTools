// Builds the image prompt for a frame. Fixed character descriptions are injected every time so frames stay consistent.

export function buildFramePrompt(project, slide, frame, characters) {
  const cast = characters.filter((c) => frame.characterIds?.includes(c.id));
  const speakers = [...new Set((frame.dialogues || []).map((d) => d.speakerId))]
    .map((id) => cast.find((c) => c.id === id)?.name)
    .filter(Boolean);

  const lines = ['A single comic panel illustration.', `Art style: ${project.style}.`];
  if (slide.idea?.trim()) lines.push(`Story moment: ${slide.idea.trim()}`);
  if (cast.length) {
    lines.push('Characters (keep identity EXACTLY as described and as in the reference images; never change age, stated gender, face, hair, skin tone, clothing or accessories):');
    cast.forEach((c) => lines.push(`- ${c.name}: ${c.description}`));
    lines.push('Identity lock: if a character is described as a boy/male, render a boy/male; if described as a girl/female, render a girl/female. Do not swap or feminize/masculinize characters between panels.');
  } else {
    lines.push('No main characters in this panel (establishing shot).');
  }
  if (frame.scene) lines.push(`Setting: ${frame.scene}`);
  if (frame.action) lines.push(`Action: ${frame.action}`);
  if (frame.expression) lines.push(`Facial expressions / emotion: ${frame.expression}`);
  if (speakers.length) lines.push(`${speakers.join(' and ')} ${speakers.length > 1 ? 'are' : 'is'} talking.`);
  lines.push(
    'Composition: cinematic framing, characters clearly visible, leave calm empty space near the top for speech bubbles added later.',
    'IMPORTANT: do NOT draw any text, letters, numbers, speech bubbles, captions, signatures or watermarks.',
  );
  return lines.join('\n');
}
