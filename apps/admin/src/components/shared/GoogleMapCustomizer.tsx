// @oktis-works/admin - Google Map Customizer
//
// Seletor de localização para o Theme Customizer (endereço + lat/lng).

import { createSignal, Show, For } from 'solid-js';

export interface GoogleMapCustomizerProps {
  value: { address?: string; lat?: number; lng?: number } | null | undefined;
  onChange: (value: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  label?: string;
  apiKey?: string; // Opcional: se não fornecido, usa Nominatim (OpenStreetMap)
}

export function GoogleMapCustomizer(props: GoogleMapCustomizerProps) {
  const {
    value,
    onChange,
    placeholder = 'Digite um endereço...',
    label,
    apiKey,
  } = props;

  const [address, setAddress] = createSignal(value?.address || '');
  const [lat, setLat] = createSignal<number | undefined>(value?.lat);
  const [lng, setLng] = createSignal<number | undefined>(value?.lng);
  const [searching, setSearching] = createSignal(false);
  const [suggestions, setSuggestions] = createSignal<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  const notifyChange = () => {
    onChange({
      address: address(),
      lat: lat() ?? 0,
      lng: lng() ?? 0,
    });
  };

  const handleAddressChange = async (e: Event) => {
    const newAddress = (e.currentTarget as HTMLInputElement).value;
    setAddress(newAddress);
    notifyChange();

    // Debounced geocoding
    if (newAddress.length >= 3) {
      setSearching(true);
      try {
        const url = apiKey
          ? `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(newAddress)}&key=${apiKey}`
          : `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newAddress)}&limit=5`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        const results = apiKey
          ? data.results?.map((r: any) => ({ display_name: r.formatted_address, lat: r.geometry.location.lat, lon: r.geometry.location.lng })) || []
          : data || [];
        
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (err) {
        console.error('Geocoding error:', err);
      } finally {
        setSearching(false);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: { display_name: string; lat: number; lon: number }) => {
    setAddress(suggestion.display_name);
    setLat(suggestion.lat);
    setLng(suggestion.lon);
    setSuggestions([]);
    setShowSuggestions(false);
    notifyChange();
  };

  const handleLatChange = (e: Event) => {
    const newLat = parseFloat((e.currentTarget as HTMLInputElement).value);
    setLat(isNaN(newLat) ? undefined : newLat);
    notifyChange();
  };

  const handleLngChange = (e: Event) => {
    const newLng = parseFloat((e.currentTarget as HTMLInputElement).value);
    setLng(isNaN(newLng) ? undefined : newLng);
    notifyChange();
  }

  const handleBlur = () => {
    // Hide suggestions after a delay to allow click
    setTimeout(() => setShowSuggestions(false), 200);
  }

  const clear = () => {
    setAddress('');
    setLat(undefined);
    setLng(undefined);
    notifyChange();
  };

  return (
    <div class="google-map-customizer">
      <label class="googlemap-customizer__label">
        {label || 'Localização'}
      </label>
      <div class="googlemap-customizer__fields">
        <div class="googlemap-customizer__address-wrapper">
          <input
            type="text"
            class="input googlemap-customizer__address"
            placeholder={placeholder}
            value={address()}
            onInput={handleAddressChange}
            onBlur={handleBlur}
            onFocus={() => suggestions().length > 0 && setShowSuggestions(true)}
            autocomplete="off"
            aria-autocomplete="list"
            aria-controls="googlemap-suggestions"
          />
          {searching() && <span class="googlemap-customizer__loading">🔍</span>}
          <Show when={showSuggestions() && suggestions().length > 0}>
            <ul id="googlemap-suggestions" class="googlemap-customizer__suggestions">
              <For each={suggestions()}>
                {(suggestion) => (
                  <li
                    class="googlemap-customizer__suggestion"
                    onClick={() => selectSuggestion(suggestion)}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur before click
                  >
                    {suggestion.display_name}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
        <div class="googlemap-customizer__coords">
          <input
            type="number"
            class="input googlemap-customizer__coord"
            placeholder="Lat (-90 a 90)"
            step="any"
            min={-90}
            max={90}
            value={lat() ?? ''}
            onChange={handleLatChange}
            onBlur={() => { const current = lat(); if (current !== undefined && (current < -90 || current > 90)) setLat(undefined); }}
          />
          <input
            type="number"
            class="input googlemap-customizer__coord"
            placeholder="Lng (-180 a 180)"
            step="any"
            min={-180}
            max={180}
            value={lng() ?? ''}
            onChange={handleLngChange}
            onBlur={() => { const current = lng(); if (current !== undefined && (current < -180 || current > 180)) setLng(undefined); }}
          />
        </div>
      </div>
      <div class="googlemap-customizer__actions">
        <button type="button" class="btn btn-secondary" onClick={clear}>
          Limpar
        </button>
        <Show when={lat() !== undefined && lng() !== undefined}>
          <a
            class="btn btn-secondary"
            href={`https://www.google.com/maps/search/?api=1&query=${lat()},${lng()}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver no Google Maps
          </a>
        </Show>
      </div>
      <style>{`
        .google-map-customizer { display: flex; flex-direction: column; gap: 0.75rem; }
        .googlemap-customizer__label { font-size: 0.75rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.25rem; }
        .googlemap-customizer__fields { display: flex; flex-direction: column; gap: 0.5rem; }
        .googlemap-customizer__address-wrapper { position: relative; }
        .googlemap-customizer__address { padding-right: 2.5rem; }
        .googlemap-customizer__loading { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); }
        .googlemap-customizer__suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--color-white);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          list-style: none;
          margin: 0.25rem 0 0;
          padding: 0.25rem;
          max-height: 200px;
          overflow-y: auto;
          z-index: 100;
        }
        .googlemap-customizer__suggestion {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          font-size: 0.875rem;
        }
        .googlemap-customizer__suggestion:hover { background: var(--color-primary-soft); }
        .googlemap-customizer__coords { display: flex; gap: 0.5rem; }
        .googlemap-customizer__coord { flex: 1; }
      `}</style>
    </div>
  );
}
