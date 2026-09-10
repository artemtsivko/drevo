import React, { useState, useRef, useEffect } from 'react';

// Автодоповнення міст/сіл через безкоштовний Nominatim (OpenStreetMap).
// Дебаунс 400мс, показує до 5 варіантів.
export default function PlaceInput({ value, onChange, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const search = (q) => {
    clearTimeout(timer.current);
    if (!q || q.length < 2) { setOptions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&featureType=settlement&addressdetails=1&limit=5&accept-language=uk&q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setOptions(data.map((d) => ({
          label: d.display_name,
          value: [d.address?.city || d.address?.town || d.address?.village || d.address?.hamlet || d.name,
            d.address?.country].filter(Boolean).join(', '),
        })));
      } catch {
        setOptions([]);
      }
    }, 400);
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setOpen(true);
    search(v);
  };

  const pick = (opt) => {
    setQuery(opt.value);
    onChange(opt.value);
    setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={() => query.length >= 2 && setOpen(true)}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <div className="autocomplete-list">
          {options.map((opt, i) => (
            <div key={i} className="autocomplete-item" onClick={() => pick(opt)}>
              {opt.value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
