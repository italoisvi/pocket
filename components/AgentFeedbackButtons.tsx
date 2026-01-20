import { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  Text,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { ThumbsUpIcon } from './ThumbsUpIcon';
import { ThumbsDownIcon } from './ThumbsDownIcon';

type AgentFeedbackButtonsProps = {
  sessionId: string;
  messageIndex: number;
  onFeedbackSubmitted?: (feedback: 'positive' | 'negative') => void;
};

export function AgentFeedbackButtons({
  sessionId,
  messageIndex,
  onFeedbackSubmitted,
}: AgentFeedbackButtonsProps) {
  const { theme } = useTheme();
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(
    null
  );
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitFeedback = async (
    feedback: 'positive' | 'negative',
    feedbackComment?: string
  ) => {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error('[AgentFeedback] No user found');
        return;
      }

      // Update agent_actions_log for this session
      const { error } = await supabase
        .from('agent_actions_log')
        .update({
          user_feedback: feedback,
          feedback_comment: feedbackComment || null,
          feedback_at: new Date().toISOString(),
        })
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[AgentFeedback] Error submitting feedback:', error);
        return;
      }

      setSubmitted(feedback);
      onFeedbackSubmitted?.(feedback);

      console.log('[AgentFeedback] Feedback submitted:', feedback);
    } catch (error) {
      console.error('[AgentFeedback] Error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePositive = () => {
    submitFeedback('positive');
  };

  const handleNegative = () => {
    setShowCommentModal(true);
  };

  const handleSubmitNegative = () => {
    submitFeedback('negative', comment);
    setShowCommentModal(false);
    setComment('');
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={[styles.thankYouText, { color: theme.textSecondary }]}>
          Obrigado pelo feedback
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handlePositive}
          disabled={submitting}
          style={styles.button}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ThumbsUpIcon
            size={18}
            color={
              submitted === 'positive' ? theme.primary : theme.textSecondary
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleNegative}
          disabled={submitting}
          style={styles.button}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ThumbsDownIcon
            size={18}
            color={submitted === 'negative' ? '#FF4444' : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showCommentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCommentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              O que poderia melhorar?
            </Text>
            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              value={comment}
              onChangeText={setComment}
              placeholder="Opcional: conte-nos mais..."
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={500}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => {
                  setShowCommentModal(false);
                  setComment('');
                }}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primary,
                  },
                ]}
                onPress={handleSubmitNegative}
                disabled={submitting}
              >
                <Text
                  style={[styles.modalButtonText, { color: theme.background }]}
                >
                  Enviar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    padding: 4,
  },
  thankYouText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    marginBottom: 16,
    textAlign: 'center',
  },
  commentInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
});
