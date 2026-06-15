export default function SignatureBlock() {
  const cols = [
    { label: 'Imeandaliwa na:', sub: 'Reporter' },
    { label: 'Imepitiwa na (Meneja):', sub: 'Manager' },
    { label: 'Imeidhinishwa na (HR):', sub: 'HR Officer' },
  ];

  return (
    <div className="border-t-2 border-gray-800 pt-6 mt-8">
      <div className="grid grid-cols-3 gap-8">
        {cols.map(({ label, sub }) => (
          <div key={label} className="text-sm">
            <p className="font-semibold text-gray-800 mb-8">{label}</p>
            <div className="border-b border-gray-700 mb-1" />
            <p className="text-gray-500 text-xs">Jina / Cheo / Sahihi</p>
            <p className="text-gray-500 text-xs mt-3">Tarehe: _____ / _____ / _________</p>
          </div>
        ))}
      </div>
    </div>
  );
}
