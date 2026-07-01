'use client'

import { MODEL_GROUPS, KNOWN_MODELS } from '@/lib/llmConfigContext'

interface Props {
  value: string
  onChange: (model: string) => void
}

/**
 * Model picker shared by SettingsModal and OnboardingModal — grouped dropdown
 * of known models plus a free-text fallback for anything else. Lives in one
 * place so the model list only ever needs updating in lib/llmConfigContext.ts.
 */
export default function ModelSelect({ value, onChange }: Props) {
  const isKnown = KNOWN_MODELS.includes(value)

  return (
    <>
      <select
        value={isKnown ? value : '__custom__'}
        onChange={(e) => onChange(e.target.value === '__custom__' ? '' : e.target.value)}
        className="retro-select retro-input-mono"
      >
        {MODEL_GROUPS.map(({ group, models }) => (
          <optgroup key={group} label={group}>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </optgroup>
        ))}
        <option value="__custom__">Other (specify below)</option>
      </select>
      {!isKnown && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. my-custom-model"
          className="retro-input retro-input-mono mt-2"
        />
      )}
    </>
  )
}
