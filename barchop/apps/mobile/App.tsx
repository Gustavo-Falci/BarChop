import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";

import { colors, radius, typography } from "@barchop/design-tokens";
import { calcularHorariosDisponiveis } from "@barchop/scheduling";

// Tela provisória — existe pra provar que o scaffold do Expo enxerga
// os pacotes internos do monorepo. As telas de verdade estão em
// docs/screens.md e ainda não foram construídas.
const horarios = calcularHorariosDisponiveis({
  horarioFuncionamento: {
    horaAbertura: "09:00",
    horaFechamento: "18:00",
    fechado: false,
  },
  agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
  duracaoTotalMinutos: 45,
});

export default function App() {
  const tema = useColorScheme() === "dark" ? colors.dark : colors.light;

  return (
    <View style={[styles.container, { backgroundColor: tema.paper }]}>
      <StatusBar style="auto" />
      <Text style={[styles.titulo, { color: tema.ink }]}>BarChop</Text>
      <Text style={[styles.subtitulo, { color: tema.muted }]}>
        Horários livres hoje ({horarios.length})
      </Text>
      <ScrollView contentContainerStyle={styles.grade}>
        {horarios.map((hora) => (
          <View
            key={hora}
            style={[
              styles.chip,
              { backgroundColor: tema.accent, borderColor: tema.ink },
            ]}
          >
            <Text style={[styles.chipTexto, { color: tema.dark }]}>{hora}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 72,
    paddingHorizontal: 24,
  },
  titulo: {
    fontSize: 32,
    fontWeight: typography.display.fontWeight,
  },
  subtitulo: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  grade: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chipTexto: {
    fontSize: 15,
    fontWeight: typography.bodyBold.fontWeight,
  },
});
