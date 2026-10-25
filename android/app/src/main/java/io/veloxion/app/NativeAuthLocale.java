package io.veloxion.app;

public final class NativeAuthLocale {
    public static final String PREFERENCES="veloxion_native_preferences", KEY="locale";
    public static final String[] CODES={"en","de","it","es","fr","pl","zh"};
    public static final String[] LABELS={"English","Deutsch","Italiano","Español","Français","Polski","中文"};
    public static boolean supported(String value) {
        for (String code:CODES) if (code.equals(value)) return true;
        return false;
    }
    public static String resolve(String saved,String device) {
        if (supported(saved)) return saved;
        String base=device==null?"":device.toLowerCase(java.util.Locale.ROOT).split("[-_]",2)[0];
        return supported(base)?base:"en";
    }
}
