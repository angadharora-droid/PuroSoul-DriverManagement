import { useEffect, useState } from 'react';
import Select from 'react-select';
import { api } from '../api/client';

/**
 * Strict select-only party picker: options come from the approved Party
 * database and free-text entry is impossible (plain react-select, not
 * Creatable). The backend re-validates the id regardless.
 */
export default function PartySelect({ value, onChange, autoFocus = false }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/parties/options')
      .then((data) =>
        setOptions(
          data.parties.map((p) => ({
            value: p._id,
            label: p.distributorCode ? `${p.name} (${p.distributorCode})` : p.name,
            // Masked only — the raw numbers never reach the client.
            mobileChoices: p.mobileChoices || [],
          }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <Select
      inputId="party-select"
      options={options}
      value={value}
      onChange={onChange}
      isLoading={loading}
      isSearchable
      isClearable
      autoFocus={autoFocus}
      placeholder="Search party name…"
      noOptionsMessage={({ inputValue }) =>
        inputValue ? 'No matching party — contact admin to add it' : 'No parties available'
      }
      styles={{
        control: (base, state) => ({
          ...base,
          minHeight: 48,
          borderRadius: 12,
          fontSize: 14,
          borderColor: state.isFocused ? '#2368a5' : '#cbd5e1',
          boxShadow: state.isFocused ? '0 0 0 2px rgba(24,89,151,0.2)' : 'none',
          transition: 'border-color 150ms, box-shadow 150ms',
          '&:hover': { borderColor: '#2368a5' },
        }),
        valueContainer: (base) => ({ ...base, paddingLeft: 14 }),
        placeholder: (base) => ({ ...base, color: '#94a3b8' }),
        option: (base, state) => ({
          ...base,
          fontSize: 14,
          padding: '10px 14px',
          backgroundColor: state.isSelected ? '#185997' : state.isFocused ? '#eff6fc' : 'white',
          color: state.isSelected ? 'white' : '#0f172a',
          ':active': { backgroundColor: state.isSelected ? '#185997' : '#dcebf7' },
        }),
        menu: (base) => ({
          ...base,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 30px -6px rgb(15 23 42 / 0.15), 0 4px 10px -4px rgb(15 23 42 / 0.08)',
        }),
        noOptionsMessage: (base) => ({ ...base, fontSize: 13, color: '#64748b' }),
      }}
    />
  );
}
