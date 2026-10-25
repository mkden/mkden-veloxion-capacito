import io.veloxion.app.NativePhoneMask;

public final class NativePhoneMaskProbe {
    public static void main(String[] args) {
        if (args[0].equals("format")) System.out.print(NativePhoneMask.format(args[1]));
        else if (args[0].equals("canonical")) System.out.print(NativePhoneMask.canonical(args[1]));
        else {
            NativePhoneMask.Edit edit=NativePhoneMask.edit(args[1],Integer.parseInt(args[2]),Integer.parseInt(args[3]),args[4]);
            System.out.print(edit.text+"\n"+edit.selection);
        }
    }
}
