import ScreenObtainer from './ScreenObtainer';

/**
 * A stand-in for the stream getDisplayMedia resolves with, carrying only what
 * the success path actually touches.
 *
 * @returns {any} The fake stream.
 */
function fakeStream() {
    const track = {
        applyConstraints: () => { /* nothing to constrain on a fake */ },
        contentHint: '',
        getSettings: () => ({ deviceId: 'screen:0:0' }),
        stop: () => { /* nothing to stop */ }
    };

    return {
        getAudioTracks: () => [],
        getVideoTracks: () => [ track ],
        id: 'fake-stream'
    };
}

describe('ScreenObtainer', () => {
    describe('_obtainScreenFromGetDisplayMedia', () => {
        let getDisplayMediaSpy: jasmine.Spy;

        beforeEach(() => {
            if (!navigator.mediaDevices) {
                (navigator as any).mediaDevices = {};
            }
            if (!(navigator.mediaDevices as any).getDisplayMedia) {
                (navigator.mediaDevices as any).getDisplayMedia = () => Promise.resolve();
            }
            getDisplayMediaSpy = spyOn(navigator.mediaDevices as any, 'getDisplayMedia')
                .and.returnValue(Promise.resolve(fakeStream()));

            // The rate a deployment configured, which a call is allowed to override.
            (ScreenObtainer as any).init({ desktopSharingFrameRate: { max: 60,
                min: 5 } });
        });

        /**
         * The frame rate handed to getDisplayMedia by the last call to it.
         *
         * @returns {any} The frame rate constraint.
         */
        function capturedFrameRate() {
            return getDisplayMediaSpy.calls.mostRecent().args[0].video.frameRate;
        }

        it('uses the configured frame rate when a call does not choose one', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(() => resolve(), () => resolve());
            });

            expect(capturedFrameRate().max).toBe(60);
        });

        it('prefers the frame rate a call chose', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(
                    () => resolve(),
                    () => resolve(),
                    { desktopSharingFrameRate: { max: 5,
                        min: 5 } });
            });

            expect(capturedFrameRate().max).toBe(5);
        });

        // On Electron this is the only route to the method above, so a rate dropped here reaches
        // every browser and nothing in the desktop app -- which is exactly how it shipped once.
        it('carries a call\'s frame rate through the Electron entry point', async () => {
            (ScreenObtainer as any)._electronSkipDisplayMedia = false;

            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenOnElectron(
                    () => resolve(),
                    () => resolve(),
                    { desktopSharingFrameRate: { max: 5,
                        min: 5 } });
            });

            expect(capturedFrameRate().max).toBe(5);
        });
    });
});
