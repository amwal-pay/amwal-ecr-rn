import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ScrollViewInstance,
  type StyleProp,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { formatDisplayDate, permittedLabel, reportedTransport } from './model';
import type { SignOnView } from './signOn';
import { colors } from './theme';

let revealField: ((node: ViewInstance) => void) | null = null;

/** Scrolls the focused field above the keyboard. Edge-to-edge draws over it otherwise. */
export function FormScroll({
  children,
  contentContainerStyle,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const keyboardHeight = useRef(0);
  const focused = useRef<ViewInstance | null>(null);
  const [keyboard, setKeyboard] = useState(0);

  const reveal = (node: ViewInstance) => {
    focused.current = node;
    alignField(scrollRef, scrollY, keyboardHeight, node);
    setTimeout(() => alignField(scrollRef, scrollY, keyboardHeight, node), 300);
  };

  useEffect(() => {
    revealField = reveal;
    return () => {
      if (revealField === reveal) revealField = null;
    };
  });

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      const windowHeight = Dimensions.get('window').height;
      const height = Math.max(
        event.endCoordinates.height,
        windowHeight - event.endCoordinates.screenY
      );
      keyboardHeight.current = height;
      setKeyboard(height);
      const node = focused.current;
      if (!node) return;
      setTimeout(
        () => alignField(scrollRef, scrollY, keyboardHeight, node),
        50
      );
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      setKeyboard(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const rawPad = StyleSheet.flatten(contentContainerStyle)?.paddingBottom;
  const basePad = typeof rawPad === 'number' ? rawPad : 24;

  return (
    <View style={styles.formScroll}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: basePad + keyboard },
        ]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        style={styles.formScroll}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function alignField(
  scrollRef: RefObject<ScrollViewInstance | null>,
  scrollY: RefObject<number>,
  keyboardHeight: RefObject<number>,
  node: ViewInstance
) {
  const keyboard = keyboardHeight.current ?? 0;
  if (keyboard <= 0) return;
  node.measureInWindow((_x, y, _width, height) => {
    const visibleBottom = Dimensions.get('window').height - keyboard - 12;
    const overflow = y + height - visibleBottom;
    if (overflow > 0) {
      scrollRef.current?.scrollTo({
        y: (scrollY.current ?? 0) + overflow,
        animated: true,
      });
    }
  });
}

export function Screen({
  title,
  onBack,
  onTerminals,
  fab,
  children,
}: {
  title: string;
  onBack?: () => void;
  onTerminals?: () => void;
  fab?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.barSafe, { paddingTop: statusInset() }]}>
        <View style={styles.bar}>
          {onBack ? (
            <Pressable
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={onBack}
              style={styles.barButton}
            >
              <Text style={styles.barIcon}>‹</Text>
            </Pressable>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.barTitle, !onBack && styles.barTitleInset]}
          >
            {title}
          </Text>
          {onTerminals ? (
            <Pressable
              accessibilityLabel="Terminals"
              hitSlop={8}
              onPress={onTerminals}
              style={styles.barButton}
            >
              <StorageIcon />
            </Pressable>
          ) : (
            <View style={styles.barButton} />
          )}
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      {fab ? (
        <Pressable
          accessibilityLabel="Add terminal"
          onPress={fab}
          style={styles.fab}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function statusInset(): number {
  if (Platform.OS === 'android') return StatusBar.currentHeight ?? 0;
  return 54;
}

function StorageIcon() {
  return (
    <View style={styles.storage}>
      <View style={styles.storageCap} />
      <View style={styles.storageBody} />
      <View style={styles.storageCap} />
    </View>
  );
}

export function OutlinedField({
  label,
  value,
  onChangeText,
  error,
  hint,
  editable = true,
  keyboardType,
  secure,
  trailing,
  onFocus,
  autoCapitalize = 'none',
  multiline,
  caretAtEnd,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  error?: string | null;
  hint?: string;
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  secure?: boolean;
  trailing?: ReactNode;
  onFocus?: () => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  caretAtEnd?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const fieldRef = useRef<ViewInstance>(null);
  const floated = focused || value.length > 0;
  const border = error
    ? colors.error
    : focused
      ? colors.primary
      : colors.outline;
  const labelColor = error
    ? colors.error
    : focused
      ? colors.primary
      : colors.onSurfaceVariant;

  return (
    <View ref={fieldRef}>
      <View
        pointerEvents={editable ? 'auto' : 'none'}
        style={[
          styles.field,
          { borderColor: border },
          !editable && styles.fieldDisabled,
        ]}
      >
        <Text
          style={[
            styles.fieldLabel,
            floated ? styles.fieldLabelFloated : styles.fieldLabelRest,
            { color: labelColor },
          ]}
        >
          {label}
        </Text>
        <TextInput
          autoCapitalize={autoCapitalize}
          editable={editable}
          keyboardType={keyboardType}
          multiline={multiline}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
            const node = fieldRef.current;
            if (node) revealField?.(node);
          }}
          secureTextEntry={secure}
          {...(caretAtEnd
            ? { selection: { start: value.length, end: value.length } }
            : {})}
          style={[
            styles.fieldInput,
            floated && styles.fieldInputFloated,
            Boolean(trailing) && styles.fieldInputTrailing,
          ]}
          value={value}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {hint && !error ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

export function Dropdown<T>({
  label,
  options,
  selected,
  onSelected,
  optionLabel,
  enabled = true,
}: {
  label: string;
  options: T[];
  selected: T | undefined;
  onSelected: (option: T) => void;
  optionLabel: (option: T) => string;
  enabled?: boolean;
}) {
  const anchor = useRef<ViewInstance>(null);
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const show = () => {
    anchor.current?.measureInWindow((x, y, width, height) => {
      setFrame({ x, y, width, height });
      setOpen(true);
    });
  };
  const menuTop = menuOrigin(frame, options.length);

  return (
    <View ref={anchor} style={styles.dropdown}>
      <Pressable disabled={!enabled} onPress={show}>
        <OutlinedField
          editable={false}
          label={label}
          trailing={<Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>}
          value={selected ? optionLabel(selected) : ''}
        />
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <View style={styles.menuHost}>
          <Pressable style={styles.menuScrim} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.menu,
              { left: frame.x, top: menuTop, width: frame.width },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.menuScroll}
            >
              {options.map((option, index) => (
                <Pressable
                  key={`${optionLabel(option)}-${index}`}
                  onPress={() => {
                    onSelected(option);
                    setOpen(false);
                  }}
                  style={styles.menuItem}
                >
                  <Text style={styles.menuText}>{optionLabel(option)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function menuOrigin(
  frame: { y: number; height: number },
  count: number
): number {
  const menuHeight = Math.min(count * 48, 280);
  const below = frame.y + frame.height + 4;
  const limit = Dimensions.get('window').height - 16;
  if (below + menuHeight > limit) return Math.max(16, frame.y - menuHeight - 4);
  return below;
}

export function PrimaryButton({
  label,
  onPress,
  enabled = true,
}: {
  label: string;
  onPress: () => void;
  enabled?: boolean;
}) {
  return (
    <Pressable
      disabled={!enabled}
      onPress={onPress}
      style={[styles.primary, !enabled && styles.primaryDisabled]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function LabeledSwitch({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: disabled === true }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={styles.switchRow}
    >
      <View
        style={[
          styles.switchTrack,
          value ? styles.switchTrackOn : styles.switchTrackOff,
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            value ? styles.switchThumbOn : styles.switchThumbOff,
          ]}
        />
      </View>
      <Text style={styles.switchLabel}>{label}</Text>
    </Pressable>
  );
}

export function TextAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable hitSlop={6} onPress={onPress} style={styles.textAction}>
      <Text style={styles.textActionLabel}>{label}</Text>
    </Pressable>
  );
}

export function RadioRow({
  label,
  selected,
  onPress,
  caption,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  caption?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.radioRow}>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.radioCopy}>
        <Text style={styles.body}>{label}</Text>
        {caption ? <Text style={styles.hintText}>{caption}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SurfaceCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SignOnDot({ signOn }: { signOn: SignOnView | undefined }) {
  if (signOn?.kind === 'asking') {
    return (
      <ActivityIndicator
        color={colors.primary}
        size="small"
        style={styles.asking}
      />
    );
  }
  const color =
    signOn?.kind === 'ready'
      ? colors.ready
      : signOn
        ? colors.error
        : colors.outline;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export function SignOnSummary({ signOn }: { signOn: SignOnView | undefined }) {
  if (!signOn || signOn.kind === 'asking') return null;
  if (signOn.kind === 'ready') {
    const permitted = signOn.capabilities.permitted.map((item) =>
      permittedLabel(item.messageType)
    );
    if (permitted.length === 0) return null;
    return <Text style={styles.hintText}>{permitted.join(' · ')}</Text>;
  }
  return (
    <Text style={styles.errorText}>
      {signOn.kind === 'noAnswer'
        ? `No answer — ${signOn.reason}`
        : signOn.reason}
    </Text>
  );
}

export function TerminalStatus({ signOn }: { signOn: SignOnView | undefined }) {
  if (!signOn) return null;
  const capabilities =
    signOn.kind === 'ready' || signOn.kind === 'notReady'
      ? signOn.capabilities
      : undefined;
  const transport = capabilities
    ? reportedTransport(capabilities.ecrMode)
    : null;
  const name = capabilities?.terminalName;
  const headline = [
    signOn.kind === 'asking'
      ? 'Asking the terminal…'
      : signOn.kind === 'ready'
        ? 'Terminal ready'
        : 'Terminal not ready',
    transport,
    name || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.status}>
      <View style={styles.statusRow}>
        <SignOnDot signOn={signOn} />
        <Text
          style={[
            styles.body,
            {
              color:
                signOn.kind === 'ready'
                  ? colors.primary
                  : colors.onSurfaceVariant,
            },
          ]}
        >
          {headline}
        </Text>
      </View>
      <SignOnSummary signOn={signOn} />
    </View>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={styles.scrim}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.body}>{message}</Text>
          <View style={styles.dialogActions}>
            <TextAction label="Cancel" onPress={onCancel} />
            <TextAction label={confirmLabel} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DateField({
  value,
  onChange,
  enabled,
}: {
  value: Date;
  onChange: (date: Date) => void;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1)
  );
  const label = formatDisplayDate(value);

  return (
    <View>
      <Pressable
        disabled={!enabled}
        onPress={() => {
          setCursor(new Date(value.getFullYear(), value.getMonth(), 1));
          setOpen(true);
        }}
      >
        <OutlinedField
          editable={false}
          hint="The day the original transaction was taken"
          label="Original transaction date"
          trailing={<Text style={styles.calendar}>▦</Text>}
          value={label}
        />
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <View style={styles.monthRow}>
              <TextAction
                label="‹"
                onPress={() =>
                  setCursor(
                    (current) =>
                      new Date(current.getFullYear(), current.getMonth() - 1, 1)
                  )
                }
              />
              <Text style={styles.dialogTitle}>
                {cursor.toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <TextAction
                label="›"
                onPress={() =>
                  setCursor(
                    (current) =>
                      new Date(current.getFullYear(), current.getMonth() + 1, 1)
                  )
                }
              />
            </View>
            <View style={styles.days}>
              {calendarDays(cursor).map((day, index) => {
                const future =
                  day != null && startOfDay(day) > startOfDay(new Date());
                const selected = day != null && sameDay(day, value);
                return (
                  <Pressable
                    key={day ? day.toISOString() : `pad-${index}`}
                    disabled={day == null || future}
                    onPress={() => {
                      if (day) onChange(day);
                      setOpen(false);
                    }}
                    style={[styles.day, selected && styles.daySelected]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        future && styles.dayMuted,
                        selected && styles.daySelectedText,
                      ]}
                    >
                      {day ? day.getDate() : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.dialogActions}>
              <TextAction label="Cancel" onPress={() => setOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function calendarDays(month: Date): Array<Date | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = first.getDay();
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const days: Array<Date | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return days;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

function sameDay(left: Date, right: Date): boolean {
  return startOfDay(left) === startOfDay(right);
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  formScroll: { flex: 1 },
  barSafe: { backgroundColor: colors.primary },
  bar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    flexDirection: 'row',
    height: 64,
    paddingHorizontal: 4,
  },
  barButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  barIcon: {
    color: colors.onPrimary,
    fontSize: 34,
    lineHeight: 36,
    marginTop: -4,
  },
  barTitle: {
    color: colors.onPrimary,
    flex: 1,
    fontSize: 22,
    fontWeight: '500',
  },
  barTitleInset: { marginLeft: 12 },
  content: { backgroundColor: colors.surface, flex: 1 },
  storage: { height: 20, justifyContent: 'space-between', width: 18 },
  storageCap: {
    borderColor: colors.onPrimary,
    borderRadius: 8,
    borderWidth: 1.5,
    height: 5,
  },
  storageBody: {
    borderColor: colors.onPrimary,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    height: 8,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 28,
    bottom: Platform.OS === 'ios' ? 36 : 24,
    elevation: 4,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    width: 56,
  },
  fabIcon: {
    color: colors.onPrimary,
    fontSize: 32,
    lineHeight: 34,
    marginTop: -2,
  },
  field: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 12,
  },
  fieldDisabled: { opacity: 1 },
  fieldLabel: { backgroundColor: colors.surface, paddingHorizontal: 4 },
  fieldLabelRest: {
    color: colors.onSurfaceVariant,
    fontSize: 16,
    position: 'absolute',
    left: 12,
  },
  fieldLabelFloated: {
    fontSize: 12,
    left: 8,
    position: 'absolute',
    top: -8,
  },
  fieldInput: { color: colors.onSurface, fontSize: 16, paddingVertical: 8 },
  fieldInputFloated: { marginTop: 8 },
  trailing: { position: 'absolute', right: 4, zIndex: 2 },
  fieldInputTrailing: { paddingRight: 72 },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  hintText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  dropdown: { zIndex: 1 },
  menuHost: { flex: 1 },
  menuScrim: { ...StyleSheet.absoluteFill },
  menuScroll: { maxHeight: 280 },
  chevron: { color: colors.onSurfaceVariant, fontSize: 12, padding: 8 },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    elevation: 6,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuText: { color: colors.onSurface, fontSize: 16 },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 52,
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.38 },
  primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  textAction: { paddingHorizontal: 12, paddingVertical: 8 },
  textActionLabel: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingVertical: 4,
  },
  switchTrack: {
    borderRadius: 16,
    borderWidth: 2,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 2,
    width: 56,
  },
  switchTrackOff: {
    backgroundColor: '#E8EAED',
    borderColor: '#5F6368',
    alignItems: 'flex-start',
  },
  switchTrackOn: {
    alignItems: 'flex-end',
    backgroundColor: colors.primary,
    borderColor: '#0847C7',
  },
  switchThumb: { borderRadius: 12, height: 24, width: 24 },
  switchThumbOff: { backgroundColor: '#3C4043' },
  switchThumbOn: { backgroundColor: colors.onPrimary },
  switchLabel: { color: colors.onSurface, flex: 1, fontSize: 16 },
  radioRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 4 },
  radioOuter: {
    alignItems: 'center',
    borderColor: colors.onSurfaceVariant,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioOuterOn: { borderColor: colors.primary },
  radioInner: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  radioCopy: { flex: 1, marginLeft: 8 },
  body: { color: colors.onSurface, fontSize: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  asking: { height: 10, transform: [{ scale: 0.55 }], width: 10 },
  dot: { borderRadius: 5, height: 10, width: 10 },
  status: { gap: 2 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  scrim: {
    alignItems: 'center',
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    maxWidth: 420,
    padding: 24,
    width: '100%',
  },
  dialogTitle: { color: colors.onSurface, fontSize: 22, marginBottom: 12 },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  calendar: { color: colors.onSurfaceVariant, fontSize: 18, padding: 8 },
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  day: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: '14.28%',
  },
  daySelected: { backgroundColor: colors.primary, borderRadius: 20 },
  dayText: { color: colors.onSurface, fontSize: 14 },
  dayMuted: { color: colors.outline },
  daySelectedText: { color: colors.onPrimary },
});
