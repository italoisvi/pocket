import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import { supabase } from '@/lib/supabase';
import { ChevronLeftIcon } from '@/components/ChevronLeftIcon';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import { TrashIcon } from '@/components/TrashIcon';
import { useTheme } from '@/lib/theme';

type Analysis = {
  id: string;
  content: string;
  created_at: string;
  context_data: {
    monthlyIncome?: number;
    currentMonthTotal?: number;
  };
};

export default function RaioXHistoryScreen() {
  const { theme } = useTheme();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadAnalyses();
    }, [])
  );

  const loadAnalyses = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('walts_analyses')
        .select('*')
        .eq('user_id', user.id)
        .eq('analysis_type', 'raio_x_financeiro')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading analyses:', error);
        return;
      }

      setAnalyses(data || []);
    } catch (error) {
      console.error('Error loading analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteAnalysis = async (id: string) => {
    Alert.alert(
      'Excluir Análise',
      'Tem certeza que deseja excluir esta análise?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('walts_analyses')
                .delete()
                .eq('id', id);

              if (error) {
                Alert.alert('Erro', 'Não foi possível excluir a análise');
                return;
              }

              setAnalyses(analyses.filter((a) => a.id !== id));
            } catch (error) {
              Alert.alert('Erro', 'Ocorreu um erro ao excluir');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[styles.header, { backgroundColor: theme.background }]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          Histórico de Análises
        </Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <LoadingKangaroo size={80} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
              Carregando análises...
            </Text>
          </View>
        ) : analyses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma análise salva
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Gere uma análise no Raio-X Financeiro e salve para visualizar
              aqui.
            </Text>
          </View>
        ) : (
          analyses.map((analysis) => (
            <View
              key={analysis.id}
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleExpand(analysis.id)}
              >
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardDate, { color: theme.text }]}>
                    {formatDate(analysis.created_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteAnalysis(analysis.id)}
                >
                  <TrashIcon size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>

              {expandedId === analysis.id && (
                <View style={styles.cardContent}>
                  <Markdown
                    style={{
                      body: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                      },
                      text: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                      },
                      heading1: {
                        color: theme.text,
                        fontFamily: 'DMSans-Bold',
                        fontSize: 20,
                        marginTop: 16,
                        marginBottom: 8,
                      },
                      heading2: {
                        color: theme.text,
                        fontFamily: 'DMSans-SemiBold',
                        fontSize: 18,
                        marginTop: 12,
                        marginBottom: 6,
                      },
                      heading3: {
                        color: theme.text,
                        fontFamily: 'DMSans-SemiBold',
                        fontSize: 16,
                        marginTop: 8,
                        marginBottom: 4,
                      },
                      heading4: {
                        color: theme.text,
                        fontFamily: 'DMSans-SemiBold',
                        fontSize: 15,
                        marginTop: 8,
                        marginBottom: 4,
                      },
                      paragraph: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                        lineHeight: 24,
                        marginBottom: 8,
                      },
                      bullet_list: {
                        marginBottom: 8,
                      },
                      ordered_list: {
                        marginBottom: 8,
                      },
                      list_item: {
                        flexDirection: 'row',
                        marginBottom: 4,
                      },
                      bullet_list_icon: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                      },
                      ordered_list_icon: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                      },
                      bullet_list_content: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                      },
                      ordered_list_content: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        fontSize: 16,
                      },
                      strong: {
                        color: theme.text,
                        fontFamily: 'DMSans-Bold',
                      },
                      em: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                      },
                      link: {
                        color: theme.primary,
                        fontFamily: 'DMSans-Regular',
                      },
                      blockquote: {
                        color: theme.textSecondary,
                        fontFamily: 'DMSans-Regular',
                        borderLeftWidth: 3,
                        borderLeftColor: theme.primary,
                        paddingLeft: 12,
                        marginVertical: 8,
                      },
                      code_inline: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        backgroundColor: theme.cardBorder,
                        paddingHorizontal: 4,
                        borderRadius: 4,
                      },
                      fence: {
                        color: theme.text,
                        fontFamily: 'DMSans-Regular',
                        backgroundColor: theme.cardBorder,
                        padding: 8,
                        borderRadius: 8,
                        marginVertical: 8,
                      },
                      hr: {
                        backgroundColor: theme.cardBorder,
                        height: 1,
                        marginVertical: 12,
                      },
                    }}
                  >
                    {analysis.content}
                  </Markdown>
                </View>
              )}

              {expandedId !== analysis.id && (
                <Text
                  style={[styles.previewText, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {analysis.content.replace(/[#*_]/g, '').substring(0, 150)}...
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'DMSans-Regular',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    lineHeight: 24,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardDate: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  deleteButton: {
    padding: 8,
  },
  cardContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  previewText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 12,
    lineHeight: 20,
  },
});
