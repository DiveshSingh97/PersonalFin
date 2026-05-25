"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(formData: FormData) {
  const email = getTextField(formData, "email");
  const password = getTextField(formData, "password");

  if (!email || !password) {
    redirect("/login?message=Email%20and%20password%20are%20required.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/uploads");
}

export async function signUpAction(formData: FormData) {
  const email = getTextField(formData, "email");
  const password = getTextField(formData, "password");

  if (!email || !password) {
    redirect("/login?message=Email%20and%20password%20are%20required.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  if (!data.session) {
    redirect("/login?message=Account%20created.%20Check%20your%20email%20to%20confirm%20before%20signing%20in.");
  }

  redirect("/uploads");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function getTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}
