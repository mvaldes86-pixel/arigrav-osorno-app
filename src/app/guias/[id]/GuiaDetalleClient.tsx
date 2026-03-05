"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Guia = {
  id: string;
  numero: number;
  fecha: string;
  faena: string;
  patente: string;
  clientes: { nombre: string } | null;
};

export default function GuiaDetalleClient({ id }: { id: string }) {
  const [guia, setGuia] = useState<Guia | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("guias")
        .select("id, numero, fecha, faena, patente, clientes(nombre)")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setErrorMsg(error.message);
        return;
      }

      setGuia(data as Guia);
    };

    load();
  }, [id]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href="/guias">← Volver</Link>
      </div>

      {errorMsg ? (
        <div className="border p-4">
          <p className="font-bold">No pude cargar la guía</p>
          <p className="text-sm">{errorMsg}</p>
          <p className="text-sm mt-2">ID: {id}</p>
        </div>
      ) : !guia ? (
        <p>Cargando...</p>
      ) : (
        <div className="border p-4">
          <h1 className="text-xl font-bold">Guía N° {guia.numero}</h1>
          <p><strong>Fecha:</strong> {guia.fecha}</p>
          <p><strong>Cliente:</strong> {guia.clientes?.nombre ?? "-"}</p>
          <p><strong>Faena:</strong> {guia.faena}</p>
          <p><strong>Patente:</strong> {guia.patente}</p>
        </div>
      )}
    </div>
  );
}