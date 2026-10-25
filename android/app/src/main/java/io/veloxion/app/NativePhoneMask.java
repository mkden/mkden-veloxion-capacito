package io.veloxion.app;

/** Same +7 formatting as the RUS website, independent of Android views. */
public final class NativePhoneMask {
    private NativePhoneMask() {}
    public static final class Edit {
        public final String text;
        public final int selection;
        Edit(String text, int selection) { this.text = text; this.selection = selection; }
    }
    private static boolean digit(char value) { return value >= '0' && value <= '9'; }
    public static String digits(String value) {
        StringBuilder result = new StringBuilder();
        for (char c : value.toCharArray()) if (digit(c)) result.append(c);
        return result.toString();
    }
    public static String format(String value) {
        String number = digits(value);
        if (number.startsWith("8")) number = "7" + number.substring(1);
        if (!number.startsWith("7")) number = "7" + number;
        number = number.substring(0, Math.min(11, number.length()));
        StringBuilder result = new StringBuilder("+7");
        if (number.length() > 1) result.append(" (").append(number, 1, Math.min(4, number.length()));
        if (number.length() >= 4) result.append(')');
        if (number.length() > 4) result.append(' ').append(number, 4, Math.min(7, number.length()));
        if (number.length() > 7) result.append('-').append(number, 7, Math.min(9, number.length()));
        if (number.length() > 9) result.append('-').append(number, 9, number.length());
        return result.toString();
    }
    public static boolean complete(String value) { return digits(value).matches("7[0-9]{10}"); }
    public static String canonical(String value) { return complete(value) ? "+" + digits(value) : ""; }
    public static Edit edit(String previous, int location, int length, String replacement) {
        int start = Math.max(0, Math.min(location, previous.length()));
        int end = Math.max(start, Math.min(previous.length(), start + Math.max(0, length)));
        // Backspacing a bracket/space/dash must remove a digit, not reinsert the separator forever.
        if (replacement.isEmpty() && end > start && digits(previous.substring(start, end)).isEmpty()) {
            for (int i = start - 1; i > 1; i--) if (digit(previous.charAt(i))) { start = i; break; }
        }
        String candidate = previous.substring(0, start) + replacement + previous.substring(end);
        if (candidate.isEmpty()) return new Edit("", 0);
        String raw = digits(candidate);
        int leftDigits = digits(candidate.substring(0, start + replacement.length())).length();
        if (!raw.isEmpty() && raw.charAt(0) != '7' && raw.charAt(0) != '8') leftDigits++;
        String formatted = format(candidate);
        int position = Math.min(2, formatted.length()), seen = 0;
        for (int i = 0; i < formatted.length(); i++) {
            if (digit(formatted.charAt(i)) && ++seen >= leftDigits) { position = i + 1; break; }
            position = i + 1;
        }
        if (!replacement.isEmpty()) while (position < formatted.length() && !digit(formatted.charAt(position))) position++;
        return new Edit(formatted, Math.min(position, formatted.length()));
    }
}
